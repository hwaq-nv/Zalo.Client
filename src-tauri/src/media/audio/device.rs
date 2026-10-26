// Callback của cpal chạy realtime: chỉ đẩy/lấy qua ringbuf, không cấp phát, không chờ khoá
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{Device, FromSample, SampleFormat, SizedSample, Stream, StreamConfig};
use ringbuf::traits::{Consumer, Producer, Split};
use ringbuf::{HeapCons, HeapProd, HeapRb};
use rubato::audioadapter_buffers::direct::InterleavedSlice;
use rubato::{Fft, FixedSync, Resampler};
use std::collections::VecDeque;
use std::sync::mpsc::Sender;

// (true = mic, lý do)
pub type DeviceError = (bool, String);

pub struct Devices {
    _input: Stream,
    _output: Stream,
    pub mic: HeapCons<f32>,
    pub speaker: HeapProd<f32>,
    pub in_rate: u32,
    pub out_rate: u32,
}

pub fn names(input: bool) -> Vec<String> {
    let host = cpal::default_host();
    let list: Vec<Device> = if input { host.input_devices().map(Iterator::collect) } else { host.output_devices().map(Iterator::collect) }.unwrap_or_default();
    list.iter().filter_map(|d| Some(d.description().ok()?.name().to_string())).collect()
}

fn named(list: impl Iterator<Item = Device>, name: Option<&str>) -> Option<Device> {
    let name = name?;
    list.into_iter().find(|d| d.description().is_ok_and(|x| x.name() == name))
}

pub fn open(mic: Option<&str>, speaker: Option<&str>, errors: Sender<DeviceError>) -> Result<Devices, DeviceError> {
    let host = cpal::default_host();
    let idev = host
        .input_devices()
        .ok()
        .and_then(|l| named(l, mic))
        .or_else(|| host.default_input_device())
        .ok_or((true, "không có micro".to_string()))?;
    let odev = host
        .output_devices()
        .ok()
        .and_then(|l| named(l, speaker))
        .or_else(|| host.default_output_device())
        .ok_or((false, "không có loa".to_string()))?;
    let icfg = idev.default_input_config().map_err(|e| (true, e.to_string()))?;
    let ocfg = odev.default_output_config().map_err(|e| (false, e.to_string()))?;
    let (iprod, icons) = HeapRb::<f32>::new(icfg.sample_rate() as usize).split();
    let (oprod, ocons) = HeapRb::<f32>::new(ocfg.sample_rate() as usize).split();
    let input = build_input(&idev, icfg.sample_format(), &icfg.config(), iprod, errors.clone()).map_err(|e| (true, e))?;
    let output = build_output(&odev, ocfg.sample_format(), &ocfg.config(), ocons, errors).map_err(|e| (false, e))?;
    input.play().map_err(|e| (true, e.to_string()))?;
    output.play().map_err(|e| (false, e.to_string()))?;
    Ok(Devices { _input: input, _output: output, mic: icons, speaker: oprod, in_rate: icfg.sample_rate(), out_rate: ocfg.sample_rate() })
}

fn build_input(dev: &Device, fmt: SampleFormat, cfg: &StreamConfig, prod: HeapProd<f32>, err: Sender<DeviceError>) -> Result<Stream, String> {
    match fmt {
        SampleFormat::F32 => input::<f32>(dev, cfg, prod, err),
        SampleFormat::I16 => input::<i16>(dev, cfg, prod, err),
        SampleFormat::I32 => input::<i32>(dev, cfg, prod, err),
        SampleFormat::U16 => input::<u16>(dev, cfg, prod, err),
        f => Err(format!("micro dùng định dạng {f:?}, chưa hỗ trợ")),
    }
}

fn build_output(dev: &Device, fmt: SampleFormat, cfg: &StreamConfig, cons: HeapCons<f32>, err: Sender<DeviceError>) -> Result<Stream, String> {
    match fmt {
        SampleFormat::F32 => output::<f32>(dev, cfg, cons, err),
        SampleFormat::I16 => output::<i16>(dev, cfg, cons, err),
        SampleFormat::I32 => output::<i32>(dev, cfg, cons, err),
        SampleFormat::U16 => output::<u16>(dev, cfg, cons, err),
        f => Err(format!("loa dùng định dạng {f:?}, chưa hỗ trợ")),
    }
}

fn input<T>(dev: &Device, cfg: &StreamConfig, mut prod: HeapProd<f32>, err: Sender<DeviceError>) -> Result<Stream, String>
where
    T: SizedSample,
    f32: FromSample<T>,
{
    let ch = cfg.channels as usize;
    dev.build_input_stream(
        cfg.clone(),
        move |data: &[T], _: &cpal::InputCallbackInfo| {
            for frame in data.chunks(ch) {
                let _ = prod.try_push(frame.iter().map(|&x| x.to_sample::<f32>()).sum::<f32>() / ch as f32);
            }
        },
        move |e| {
            let _ = err.send((true, e.to_string()));
        },
        None,
    )
    .map_err(|e| e.to_string())
}

fn output<T>(dev: &Device, cfg: &StreamConfig, mut cons: HeapCons<f32>, err: Sender<DeviceError>) -> Result<Stream, String>
where
    T: SizedSample + FromSample<f32>,
{
    let ch = cfg.channels as usize;
    dev.build_output_stream(
        cfg.clone(),
        move |data: &mut [T], _: &cpal::OutputCallbackInfo| {
            for frame in data.chunks_mut(ch) {
                let s = T::from_sample(cons.try_pop().unwrap_or(0.0));
                frame.fill(s);
            }
        },
        move |e| {
            let _ = err.send((false, e.to_string()));
        },
        None,
    )
    .map_err(|e| e.to_string())
}

pub struct Resample {
    fft: Option<Fft<f32>>,
    pending: Vec<f32>,
    buf: Vec<f32>,
    pub out: VecDeque<f32>,
}

impl Resample {
    pub fn new(from: u32, to: u32) -> Self {
        let fft = (from != to).then(|| Fft::<f32>::new(from as usize, to as usize, from as usize / 100, 1, FixedSync::Input).expect("resampler"));
        Self { fft, pending: Vec::new(), buf: Vec::new(), out: VecDeque::new() }
    }

    pub fn push(&mut self, input: &[f32]) {
        let Some(fft) = self.fft.as_mut() else {
            self.out.extend(input);
            return;
        };
        self.pending.extend_from_slice(input);
        loop {
            let need = fft.input_frames_next();
            if self.pending.len() < need {
                return;
            }
            let n = fft.output_frames_next();
            self.buf.resize(n, 0.0);
            let src = InterleavedSlice::new(&self.pending[..need], 1, need).expect("input");
            let mut dst = InterleavedSlice::new_mut(&mut self.buf, 1, n).expect("output");
            let Ok((used, wrote)) = fft.process_into_buffer(&src, &mut dst, None) else { return };
            self.out.extend(&self.buf[..wrote]);
            self.pending.drain(..used);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resamples_48k_to_16k() {
        let mut r = Resample::new(48_000, 16_000);
        let tone: Vec<f32> = (0..48_000).map(|i| (i as f32 * 0.05).sin()).collect();
        for chunk in tone.chunks(441) {
            r.push(chunk);
        }
        assert!((15_000..=16_000).contains(&r.out.len()), "{}", r.out.len());
    }

    #[test]
    fn same_rate_passes_through() {
        let mut r = Resample::new(16_000, 16_000);
        r.push(&[0.5; 160]);
        assert_eq!(r.out.len(), 160);
    }
}
