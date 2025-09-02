# 🎭 reCognizer: Python to Browser Extension Conversion

This document explains the transformation of the reCognizer Python library into a browser extension that can detect and solve reCAPTCHAs using ONNX models directly in the web browser.

## Overview of Changes

### What Was Converted

The original reCognizer Python library has been successfully converted into a browser extension with the following components:

1. **AI Models**: Converted PyTorch models to ONNX format for browser compatibility
2. **Detection Logic**: Ported Python detection algorithms to JavaScript
3. **reCAPTCHA Integration**: Created browser content scripts to detect and interact with reCAPTCHAs
4. **User Interface**: Built a popup-based configuration interface
5. **Cross-frame Support**: Added handling for CORS-protected reCAPTCHA iframes

### Key Features Maintained

✅ **YOLO Object Detection**: For bicycles, cars, motorcycles, traffic lights, etc.
✅ **CLIP Image Classification**: For bridges, chimneys, crosswalks, etc.
✅ **CLIPSeg Area Detection**: For segmentation-based challenges
✅ **Multi-tile Support**: Both 9-tile and 16-tile reCAPTCHA grids
✅ **Challenge Parsing**: Automatic prompt interpretation
✅ **Click Optimization**: Human-like clicking with randomization

### New Browser-Specific Features

🆕 **Auto-Detection**: Automatically finds reCAPTCHAs on any website
🆕 **Background Processing**: Models run in service worker for better performance
🆕 **Debug Mode**: Visual overlays showing detection progress
🆕 **CORS Handling**: Works with cross-origin reCAPTCHA frames
🆕 **Privacy-First**: All processing happens locally in the browser

## Architecture Comparison

### Original Python Architecture
```
Python Application
├── detector.py (Main detection class)
├── image_processor.py (Image handling)
├── detection_processor.py (Result processing)
├── prompt_handler.py (Text parsing)
└── agents/
    └── playwright/ (Browser automation)
```

### New Browser Extension Architecture
```
Browser Extension
├── manifest.json (Extension config)
├── background.js (Service worker + AI engine)
├── content.js (Page injection + reCAPTCHA detection)
├── ai-engine.js (ONNX inference engine)
├── popup.html/js (User interface)
├── inject.js (Cross-frame communication)
└── models/ (ONNX model files)
```

## Technical Implementation

### Model Conversion Process

1. **PyTorch to ONNX**: Used `torch.onnx.export()` to convert models
2. **Optimization**: Enabled constant folding and simplification
3. **Browser Compatibility**: Used ONNX Runtime Web for inference
4. **Dynamic Axes**: Configured for variable batch sizes

### JavaScript AI Engine

The `ai-engine.js` file implements the core detection logic:

- **Model Loading**: Lazy loading of ONNX models
- **Image Preprocessing**: Canvas-based image processing
- **Inference Pipeline**: Matches original Python logic
- **Post-processing**: Converts model outputs to tile selections

### reCAPTCHA Detection

The content script (`content.js`) handles:

- **Automatic Detection**: Scans DOM for reCAPTCHA elements
- **Challenge Monitoring**: Watches for challenge appearances  
- **Frame Handling**: Manages cross-origin iframe access
- **User Interaction**: Simulates human-like clicking

### Performance Optimizations

- **Web Workers**: Offloads inference from main thread
- **Model Caching**: Keeps loaded models in memory
- **Lazy Loading**: Models load only when needed
- **Batch Processing**: Processes multiple images efficiently

## Usage Comparison

### Python Library Usage
```python
from recognizer import Detector

detector = Detector()
response, coordinates = detector.detect("bicycle", "image.png")
```

### Browser Extension Usage
1. Install extension in Chrome/Edge
2. Extension automatically detects reCAPTCHAs
3. AI processes challenges in the background
4. Solutions applied automatically

## File Structure

### Core Extension Files

| File | Purpose |
|------|---------|
| `manifest.json` | Extension configuration and permissions |
| `background.js` | Service worker with model management |
| `content.js` | Content script for reCAPTCHA detection |
| `ai-engine.js` | ONNX-based AI inference engine |
| `popup.html/js` | Extension popup interface |
| `inject.js` | Cross-frame communication helper |

### Model Files (Generated)

| File | Model | Purpose |
|------|-------|---------|
| `yolo11m-seg.onnx` | YOLO | Object detection & segmentation |
| `clip_vision_encoder.onnx` | CLIP Vision | Image feature extraction |
| `clip_text_encoder.onnx` | CLIP Text | Text feature extraction |
| `clipseg.onnx` | CLIPSeg | Text-guided segmentation |
| `config.json` | Configuration | Model settings and labels |

### Utility Files

| File | Purpose |
|------|---------|
| `convert_models.py` | Converts PyTorch models to ONNX |
| `validate.py` | Validates extension structure |
| `README.md` | Extension documentation |

## Installation & Usage

### 1. Model Conversion (Required First)

```bash
# From the main recognizer directory
python convert_models.py
```

This generates the ONNX models needed by the browser extension.

### 2. Load Extension

1. Open Chrome/Edge and navigate to `chrome://extensions/`
2. Enable "Developer mode" 
3. Click "Load unpacked" and select the `browser-extension/` folder
4. The extension should appear with a 🎭 icon

### 3. Configuration

Click the extension icon to:
- Enable/disable auto-solving
- Toggle debug mode
- View statistics
- Test model loading

### 4. Testing

Visit reCAPTCHA demo sites:
- https://recaptcha-demo.appspot.com/
- https://www.google.com/recaptcha/api2/demo

## Development Notes

### Browser Compatibility

- **Chrome**: Full support (Manifest V3)
- **Edge**: Full support (Chromium-based)
- **Firefox**: Would require Manifest V2 port
- **Safari**: Would need significant modifications

### Performance Considerations

- **Memory Usage**: ~200-500MB for all models loaded
- **Inference Speed**: 1-5 seconds per challenge (device-dependent)
- **Network**: All processing is local, no external requests
- **CPU/GPU**: Can leverage WebGL for acceleration

### Security Features

- **Local Processing**: No data sent to external servers
- **Minimal Permissions**: Only requests access to active tab
- **Sandboxed**: Runs in browser security context
- **Open Source**: All code available for inspection

## Limitations & Considerations

### Technical Limitations

- **Model Size**: Large ONNX files (~100-200MB total)
- **Performance**: Slower than native PyTorch on CPU
- **Memory**: High memory usage for complex models
- **Browser Support**: Limited to modern Chromium browsers

### Ethical Considerations

- **Terms of Service**: May violate some website ToS
- **Detection**: Could be detected by advanced anti-bot systems
- **Rate Limiting**: Should respect website rate limits
- **Educational Use**: Intended for research and learning

### Future Improvements

- **Model Optimization**: Quantization and pruning for smaller files
- **Performance**: WebAssembly compilation for faster inference
- **Detection**: Better reCAPTCHA element detection
- **UI/UX**: More sophisticated configuration options

## Troubleshooting

### Common Issues

1. **Models Not Loading**
   - Ensure ONNX files exist in `models/` directory
   - Check browser console for errors
   - Verify file permissions

2. **Detection Not Working**
   - Enable debug mode to see detection process
   - Check if reCAPTCHA is in a restricted iframe
   - Verify extension permissions

3. **Performance Issues**
   - Close unused browser tabs
   - Ensure sufficient system memory
   - Consider disabling other extensions

### Debug Information

Enable "Show debug info" in the extension popup to see:
- Detection progress overlays
- Model loading status  
- AI inference results
- Click coordinates and timing

## Contributing

To contribute to the browser extension:

1. Fork the repository
2. Make changes to the `browser-extension/` folder
3. Test with multiple reCAPTCHA sites
4. Ensure models convert properly
5. Submit pull request

## License

Same as the original recognizer project: GNU GPL v3

This ensures the browser extension remains open source and free for educational use.