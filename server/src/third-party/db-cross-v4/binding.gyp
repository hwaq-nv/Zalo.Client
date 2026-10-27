{
  "targets": [{
    "target_name": "db-cross-v4-native",
    "sources": ["src/main.cc"],
    "include_dirs": ["<!@(node -p \"require('node-addon-api').include\")"],
    "dependencies": ["<!(node -p \"require('node-addon-api').gyp\")"],
    "cflags!": ["-fno-exceptions"],
    "cflags_cc!": ["-fno-exceptions"],
    "defines": ["NAPI_DISABLE_CPP_EXCEPTIONS"],
    "cflags_cc": ["-std=c++17", "-O2"],
    "conditions": [
      ["OS=='win'", {
        "variables": { "vcpkg": "<!(node -p \"process.env.VCPKG_INSTALLATION_ROOT + '/installed/x64-windows-static'\")" },
        "include_dirs": ["<(vcpkg)/include"],
        "defines": ["LZMA_API_STATIC"],
        "libraries": ["<(vcpkg)/lib/libcrypto.lib", "<(vcpkg)/lib/lzma.lib", "crypt32.lib", "ws2_32.lib", "advapi32.lib", "user32.lib"],
        "msvs_settings": { "VCCLCompilerTool": { "ExceptionHandling": 1 } }
      }, {
        "libraries": ["-llzma", "-lcrypto"]
      }]
    ]
  }]
}
