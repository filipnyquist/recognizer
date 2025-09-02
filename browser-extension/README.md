# reCognizer Browser Extension

🎭 **AI-powered reCAPTCHA solver that runs entirely in your browser using ONNX models**

## Overview

This browser extension transforms the original Python-based reCognizer library into a browser extension that can automatically detect and solve reCAPTCHA challenges using AI models that run directly in the browser via ONNX Runtime Web.

## Features

- ✅ **Browser-based AI**: Uses ONNX models for inference directly in the browser
- ✅ **Automatic Detection**: Finds reCAPTCHAs on any website automatically
- ✅ **Multiple Model Support**: YOLO for object detection, CLIP for image classification, CLIPSeg for area detection
- ✅ **Privacy-focused**: All processing happens locally in your browser
- ✅ **Configurable**: Enable/disable auto-solving, debug mode, and more
- ✅ **Cross-origin Support**: Works with reCAPTCHAs in iframes

## Supported reCAPTCHA Types

### Object Detection (YOLO-based):
- Bicycles
- Cars, trucks, buses
- Motorcycles
- Boats
- Fire hydrants
- Traffic lights
- Parking meters

### Image Classification & Area Detection (CLIP-based):
- Bridges
- Chimneys
- Crosswalks
- Mountains/hills
- Palm trees
- Stairs
- Tractors
- Taxis

## Installation

### Method 1: Load as Unpacked Extension (Development)

1. **Convert AI Models** (if not already done):
   ```bash
   cd /path/to/recognizer
   python convert_models.py
   ```
   This will create ONNX versions of the PyTorch models in `browser-extension/models/`

2. **Open Chrome/Edge Extension Management**:
   - Chrome: `chrome://extensions/`
   - Edge: `edge://extensions/`

3. **Enable Developer Mode** (toggle in top right)

4. **Click "Load unpacked"** and select the `browser-extension` folder

5. **The extension should now appear** with a 🎭 icon in your toolbar

### Method 2: Build and Package (Production)

1. Follow step 1 above to convert models
2. Zip the entire `browser-extension` folder
3. Upload to Chrome Web Store or load the .zip file

## Usage

### Basic Operation

1. **Enable the extension**: Click the 🎭 icon and toggle "Enable Extension"
2. **Configure settings**: 
   - Toggle "Auto-solve reCAPTCHAs" to automatically solve detected challenges
   - Enable "Show debug info" to see detection progress
3. **Visit any site with reCAPTCHA**: The extension will automatically detect and solve challenges

### Manual Testing

1. Go to a reCAPTCHA demo site like:
   - https://recaptcha-demo.appspot.com/recaptcha-v2-checkbox-explicit.php
   - https://www.google.com/recaptcha/api2/demo

2. The extension will:
   - Detect the reCAPTCHA checkbox and click it
   - Wait for the challenge to appear
   - Analyze the challenge images using AI
   - Click the correct tiles
   - Submit the solution

### Debug Mode

Enable "Show debug info" in the popup to see:
- Detection progress overlays
- Highlighted reCAPTCHA elements
- AI analysis results
- Click coordinates

## Architecture

```
browser-extension/
├── manifest.json          # Extension configuration
├── background.js          # Service worker with AI engine
├── content.js            # Content script for reCAPTCHA detection
├── ai-engine.js          # ONNX-based AI inference engine
├── inject.js             # Script for CORS-protected frames
├── popup.html/js         # Extension popup UI
├── models/               # ONNX model files
│   ├── yolo11m-seg.onnx     # Object detection
│   ├── clip_vision_encoder.onnx  # Image encoding
│   ├── clip_text_encoder.onnx    # Text encoding  
│   ├── clipseg.onnx             # Image segmentation
│   └── config.json              # Model configuration
└── icons/                # Extension icons
```

## Technical Details

### AI Models

1. **YOLO11m-seg**: Object detection and segmentation
   - Input: 640x640 RGB images
   - Outputs: Bounding boxes, classes, segmentation masks
   - Used for: bicycles, cars, motorcycles, etc.

2. **CLIP Vision Encoder**: Image feature extraction  
   - Input: 224x224 RGB images
   - Output: 512-dimensional image embeddings
   - Used for: Image classification tasks

3. **CLIP Text Encoder**: Text feature extraction
   - Input: Tokenized text prompts
   - Output: 512-dimensional text embeddings
   - Used for: Matching text descriptions to images

4. **CLIPSeg**: Image segmentation based on text prompts
   - Input: 352x352 RGB images + text prompts
   - Output: Segmentation masks
   - Used for: Area detection challenges

### Browser Integration

- **Content Scripts**: Injected into all pages to detect reCAPTCHAs
- **Background Service Worker**: Manages AI models and processing  
- **Message Passing**: Communication between content scripts and background
- **CORS Handling**: Special handling for cross-origin reCAPTCHA frames
- **ONNX Runtime Web**: JavaScript inference engine for ONNX models

### Performance

- **Model Loading**: Models are loaded lazily when first needed
- **Caching**: Loaded models are cached in memory
- **Threading**: Uses Web Workers when available for inference
- **Memory**: ~200-500MB for all models loaded

## Troubleshooting

### Extension Not Working

1. **Check model files**: Ensure ONNX models exist in `models/` directory
2. **Open developer tools**: Check console for error messages
3. **Reload extension**: Disable and re-enable in `chrome://extensions/`
4. **Update browser**: Ensure you have a recent Chrome/Edge version

### Models Not Loading

1. **Check network**: Models load from extension files, ensure they exist
2. **Memory issues**: Close other tabs to free up memory
3. **CORS errors**: Make sure `web_accessible_resources` includes models
4. **File permissions**: Ensure model files are readable

### Detection Issues  

1. **Enable debug mode**: Turn on "Show debug info" to see detection process
2. **Check selectors**: reCAPTCHA HTML may have changed 
3. **Frame access**: Some reCAPTCHAs may be in restricted iframes
4. **Timing issues**: Page may need more time to load completely

### Performance Issues

1. **Reduce concurrent tabs**: AI inference is memory-intensive
2. **Disable unused features**: Turn off auto-solve if not needed
3. **Update hardware**: GPU acceleration helps with inference
4. **Clear cache**: Reload extension to clear cached models

## Development

### Building from Source

1. **Clone repository**:
   ```bash
   git clone https://github.com/filipnyquist/recognizer.git
   cd recognizer
   ```

2. **Install Python dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

3. **Convert models to ONNX**:
   ```bash
   python convert_models.py
   ```

4. **Test extension**:
   - Load `browser-extension/` as unpacked extension
   - Visit test reCAPTCHA sites

### Modifying Detection Logic

- **Content script**: Edit `content.js` for reCAPTCHA detection
- **AI engine**: Edit `ai-engine.js` for model inference  
- **Background**: Edit `background.js` for coordination
- **UI**: Edit `popup.html/js` for user interface

### Adding New Models

1. **Export PyTorch model to ONNX** in `convert_models.py`
2. **Update model config** in generated `config.json`  
3. **Add inference logic** in `ai-engine.js`
4. **Test with demo challenges**

## Privacy & Security

- **Local Processing**: All AI inference happens locally in your browser
- **No Data Sent**: Images and results are never sent to external servers
- **Open Source**: All code is available for inspection
- **Permissions**: Only requests access to active tab for reCAPTCHA detection

## Limitations

- **Model Size**: Extension requires ~100-200MB for all models
- **Performance**: AI inference can be slow on lower-end devices
- **Compatibility**: Only works on Chrome/Edge with Manifest V3 support  
- **Detection Rate**: Not 100% accurate, depends on image quality and content
- **Site Changes**: May need updates if reCAPTCHA HTML structure changes

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test with multiple reCAPTCHA sites
5. Submit a pull request

## License

GNU GPL v3 - same as the original recognizer project

## Disclaimer

This extension is for **educational and research purposes only**. Using automated tools to solve CAPTCHAs may violate terms of service of some websites. Use responsibly and in accordance with applicable laws and website policies.