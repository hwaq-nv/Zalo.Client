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
    pub input_rate: u32,
    pub output_rate: u32,
}

pub fn device_names(input: bool) -> Vec<String> {
    let host = cpal::default_host();
    let list: Vec<Device> = if input { host.input_devices().map(Iterator::collect) } else { host.output_devices().map(Iterator::collect) }.unwrap_or_default();
    list.iter().filter_map(|device| Some(device.description().ok()?.name().to_string())).collect()
}

fn find_by_name(devices: impl Iterator<Item = Device>, name: Option<&str>) -> Option<Device> {
    let name = name?;
    devices.into_iter().find(|device| device.description().is_ok_and(|desc| desc.name() == name))
}

pub fn open_devices(mic: Option<&str>, speaker: Option<&str>, errors: Sender<DeviceError>) -> Result<Devices, DeviceError> {
    let host = cpal::default_host();
    let input_device = host
        .input_devices()
        .ok()
        .and_then(|devices| find_by_name(devices, mic))
        .or_else(|| host.default_input_device())
        .ok_or((true, "không có micro".to_string()))?;
    let output_device = host
        .output_devices()
        .ok()
        .and_then(|devices| find_by_name(devices, speaker))
        .or_else(|| host.default_output_device())
        .ok_or((false, "không có loa".to_string()))?;
    let input_config = input_device.default_input_config().map_err(|e| (true, e.to_string()))?;
    let output_config = output_device.default_output_config().map_err(|e| (false, e.to_string()))?;
    let (mic_producer, mic_consumer) = HeapRb::<f32>::new(input_config.sample_rate() as usize).split();
    let (speaker_producer, speaker_consumer) = HeapRb::<f32>::new(output_config.sample_rate() as usize).split();
    let input = build_input(&input_device, input_config.sample_format(), &input_config.config(), mic_producer, errors.clone()).map_err(|e| (true, e))?;
    let output = build_output(&output_device, output_config.sample_format(), &output_config.config(), speaker_consumer, errors).map_err(|e| (false, e))?;
    input.play().map_err(|e| (true, e.to_string()))?;
    output.play().map_err(|e| (false, e.to_string()))?;
    Ok(Devices {
        _input: input,
        _output: output,
        mic: mic_consumer,
        speaker: speaker_producer,
        input_rate: input_config.sample_rate(),
        output_rate: output_config.sample_rate(),
    })
}

fn build_input(device: &Device, format: SampleFormat, config: &StreamConfig, producer: HeapProd<f32>, errors: Sender<DeviceError>) -> Result<Stream, String> {
    match format {
        SampleFormat::F32 => input_stream::<f32>(device, config, producer, errors),
        SampleFormat::I16 => input_stream::<i16>(device, config, producer, errors),
        SampleFormat::I32 => input_stream::<i32>(device, config, producer, errors),
        SampleFormat::U16 => input_stream::<u16>(device, config, producer, errors),
        other => Err(format!("micro dùng định dạng {other:?}, chưa hỗ trợ")),
    }
}

fn build_output(device: &Device, format: SampleFormat, config: &StreamConfig, consumer: HeapCons<f32>, errors: Sender<DeviceError>) -> Result<Stream, String> {
    match format {
        SampleFormat::F32 => output_stream::<f32>(device, config, consumer, errors),
        SampleFormat::I16 => output_stream::<i16>(device, config, consumer, errors),
        SampleFormat::I32 => output_stream::<i32>(device, config, consumer, errors),
        SampleFormat::U16 => output_stream::<u16>(device, config, consumer, errors),
        other => Err(format!("loa dùng định dạng {other:?}, chưa hỗ trợ")),
    }
}

fn input_stream<T>(device: &Device, config: &StreamConfig, mut producer: HeapProd<f32>, errors: Sender<DeviceError>) -> Result<Stream, String>
where
    T: SizedSample,
    f32: FromSample<T>,
{
    let channels = config.channels as usize;
    device.build_input_stream(
        config.clone(),
        move |data: &[T], _: &cpal::InputCallbackInfo| {
            for frame in data.chunks(channels) {
                let _ = producer.try_push(frame.iter().map(|&x| x.to_sample::<f32>()).sum::<f32>() / channels as f32);
            }
        },
        move |e| {
            let _ = errors.send((true, e.to_string()));
        },
        None,
    )
    .map_err(|e| e.to_string())
}

fn output_stream<T>(device: &Device, config: &StreamConfig, mut consumer: HeapCons<f32>, errors: Sender<DeviceError>) -> Result<Stream, String>
where
    T: SizedSample + FromSample<f32>,
{
    let channels = config.channels as usize;
    device.build_output_stream(
        config.clone(),
        move |data: &mut [T], _: &cpal::OutputCallbackInfo| {
            for frame in data.chunks_mut(channels) {
                let sample = T::from_sample(consumer.try_pop().unwrap_or(0.0));
                frame.fill(sample);
            }
        },
        move |e| {
            let _ = errors.send((false, e.to_string()));
        },
        None,
    )
    .map_err(|e| e.to_string())
}

pub struct Resample {
    fft: Option<Fft<f32>>,
    pending: Vec<f32>,
    scratch: Vec<f32>,
    pub output: VecDeque<f32>,
}

impl Resample {
    pub fn new(from: u32, to: u32) -> Self {
        let fft = (from != to).then(|| Fft::<f32>::new(from as usize, to as usize, from as usize / 100, 1, FixedSync::Input).expect("resampler"));
        Self { fft, pending: Vec::new(), scratch: Vec::new(), output: VecDeque::new() }
    }

    pub fn push(&mut self, input: &[f32]) {
        let Some(fft) = self.fft.as_mut() else {
            self.output.extend(input);
            return;
        };
        self.pending.extend_from_slice(input);
        loop {
            let input_frames = fft.input_frames_next();
            if self.pending.len() < input_frames {
                return;
            }
            let output_frames = fft.output_frames_next();
            self.scratch.resize(output_frames, 0.0);
            let src = InterleavedSlice::new(&self.pending[..input_frames], 1, input_frames).expect("input");
            let mut dst = InterleavedSlice::new_mut(&mut self.scratch, 1, output_frames).expect("output");
            let Ok((used, wrote)) = fft.process_into_buffer(&src, &mut dst, None) else { return };
            self.output.extend(&self.scratch[..wrote]);
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
        assert!((15_000..=16_000).contains(&r.output.len()), "{}", r.output.len());
    }

    #[test]
    fn same_rate_passes_through() {
        let mut r = Resample::new(16_000, 16_000);
        r.push(&[0.5; 160]);
        assert_eq!(r.output.len(), 160);
    }
}
