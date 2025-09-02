// AI Detection Engine for browser - ONNX model inference
class AIDetectionEngine {
    constructor(ortRuntime = null) {
        this.models = {};
        this.config = null;
        this.isLoaded = false;
        this.ortPromise = null;
        this.ort = ortRuntime; // Accept ONNX Runtime as parameter
    }

    async initialize() {
        if (this.isLoaded) return true;

        try {
            // Use provided ONNX Runtime or load it
            if (this.ort) {
                // ONNX Runtime already provided
            } else {
                // Load ONNX Runtime
                this.ortPromise = this.loadOnnxRuntime();
                this.ort = await this.ortPromise;
            }

            // Load configuration
            await this.loadConfig();

            // Load models (lazy loading - they'll be loaded when needed)
            this.isLoaded = true;
            return true;
        } catch (error) {
            console.error('Failed to initialize AI detection engine:', error);
            return false;
        }
    }

    async loadOnnxRuntime() {
        try {
            // Check if ONNX Runtime is already loaded globally
            if (typeof ort !== 'undefined') {
                return ort;
            }
            
            // For service workers, we need to load ONNX Runtime differently
            // We'll defer the actual loading to when we need to run inference
            // and use a content script or inject it into the page context
            throw new Error('ONNX Runtime must be loaded in page context, not service worker');
            
        } catch (error) {
            console.error('Failed to load ONNX Runtime:', error);
            throw error;
        }
    }

    async loadConfig() {
        try {
            const configUrl = chrome.runtime.getURL('models/config.json');
            const response = await fetch(configUrl);
            this.config = await response.json();
        } catch (error) {
            console.error('Failed to load model configuration:', error);
            // Use fallback config
            this.config = this.getFallbackConfig();
        }
    }

    getFallbackConfig() {
        return {
            models: {
                yolo: { path: "models/yolo11m-seg.onnx", input_size: [640, 640] },
                clip_vision: { path: "models/clip_vision_encoder.onnx", input_size: [224, 224] },
                clip_text: { path: "models/clip_text_encoder.onnx", vocab_size: 49408 },
                clipseg: { path: "models/clipseg.onnx", input_size: [352, 352] }
            },
            labels: {
                challenge_alias: {
                    "bicycle": "bicycle", "bicycles": "bicycle",
                    "car": "car", "cars": "car", "vehicles": "car",
                    "motorcycle": "motorcycle", "motorcycles": "motorcycle",
                    "bus": "bus", "buses": "bus",
                    "boat": "boat", "boats": "boat",
                    "fire hydrant": "fire hydrant", "fire hydrants": "fire hydrant",
                    "traffic light": "traffic light", "traffic lights": "traffic light"
                }
            }
        };
    }

    async loadModel(modelName) {
        if (this.models[modelName]) {
            return this.models[modelName];
        }

        try {
            const modelPath = this.config.models[modelName].path;
            const modelUrl = chrome.runtime.getURL(modelPath);
            
            const session = await this.ort.InferenceSession.create(modelUrl);
            this.models[modelName] = session;
            
            console.log(`✓ Loaded ${modelName} model`);
            return session;
        } catch (error) {
            console.error(`Failed to load ${modelName} model:`, error);
            throw error;
        }
    }

    async detect(prompt, images, areaCapcha = false) {
        if (!this.isLoaded) {
            await this.initialize();
        }

        try {
            // Parse prompt to get task type
            const taskType = this.parsePrompt(prompt);
            if (!taskType) {
                throw new Error(`Unknown task type from prompt: ${prompt}`);
            }

            console.log(`Detecting task type: ${taskType}`);

            // Choose detection method based on task type and image count
            if (this.isYoloTask(taskType)) {
                return await this.detectWithYolo(images, taskType, areaCapcha);
            } else {
                return await this.detectWithClip(images, taskType, areaCapcha);
            }
        } catch (error) {
            console.error('Detection failed:', error);
            throw error;
        }
    }

    parsePrompt(prompt) {
        const cleanPrompt = prompt.toLowerCase().trim();
        const alias = this.config.labels.challenge_alias;
        
        // Direct match
        if (alias[cleanPrompt]) {
            return alias[cleanPrompt];
        }

        // Partial match
        for (const [key, value] of Object.entries(alias)) {
            if (cleanPrompt.includes(key) || key.includes(cleanPrompt)) {
                return value;
            }
        }

        return null;
    }

    isYoloTask(taskType) {
        const yoloTasks = ['bicycle', 'car', 'motorcycle', 'bus', 'boat', 'fire hydrant', 'traffic light'];
        return yoloTasks.includes(taskType);
    }

    async detectWithYolo(images, taskType, areaCapcha) {
        console.log('Using YOLO detection for:', taskType);
        
        try {
            const yoloModel = await this.loadModel('yolo');
            
            // Process each image or combined image grid
            let inputImage;
            if (images.length === 1) {
                inputImage = images[0];
            } else {
                inputImage = this.createImageGrid(images);
            }

            // Preprocess image for YOLO
            const inputTensor = await this.preprocessImageForYolo(inputImage);
            
            // Run inference
            const results = await yoloModel.run({ images: inputTensor });
            
            // Process results
            const detections = this.processYoloResults(results, taskType, images.length);
            
            return {
                success: true,
                solution: detections.response,
                coordinates: detections.coordinates,
                confidence: detections.confidence
            };

        } catch (error) {
            console.error('YOLO detection failed:', error);
            throw error;
        }
    }

    async detectWithClip(images, taskType, areaCapcha) {
        console.log('Using CLIP detection for:', taskType);
        
        try {
            const clipVisionModel = await this.loadModel('clip_vision');
            const clipTextModel = await this.loadModel('clip_text');
            
            let results;
            if (images.length === 9 && !areaCapcha) {
                // Classification mode - process individual images
                results = await this.clipClassifyImages(images, taskType, clipVisionModel, clipTextModel);
            } else {
                // Area detection mode - use CLIPSeg
                const clipsegModel = await this.loadModel('clipseg');
                results = await this.clipSegmentArea(images, taskType, clipsegModel);
            }
            
            return {
                success: true,
                solution: results.response,
                coordinates: results.coordinates,
                confidence: results.confidence
            };

        } catch (error) {
            console.error('CLIP detection failed:', error);
            throw error;
        }
    }

    async preprocessImageForYolo(imageDataUrl) {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                
                // YOLO expects 640x640 input
                canvas.width = 640;
                canvas.height = 640;
                
                // Draw and resize image
                ctx.drawImage(img, 0, 0, 640, 640);
                
                // Get image data and normalize
                const imageData = ctx.getImageData(0, 0, 640, 640);
                const data = imageData.data;
                
                // Convert to RGB format and normalize to [0, 1]
                const input = new Float32Array(3 * 640 * 640);
                let idx = 0;
                for (let c = 0; c < 3; c++) {
                    for (let h = 0; h < 640; h++) {
                        for (let w = 0; w < 640; w++) {
                            const pixelIdx = (h * 640 + w) * 4;
                            input[idx++] = data[pixelIdx + c] / 255.0;
                        }
                    }
                }
                
                // Create tensor [1, 3, 640, 640]
                const tensor = new this.ort.Tensor('float32', input, [1, 3, 640, 640]);
                resolve(tensor);
            };
            img.src = imageDataUrl;
        });
    }

    async preprocessImageForClip(imageDataUrl, targetSize = [224, 224]) {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                
                canvas.width = targetSize[0];
                canvas.height = targetSize[1];
                
                ctx.drawImage(img, 0, 0, targetSize[0], targetSize[1]);
                
                const imageData = ctx.getImageData(0, 0, targetSize[0], targetSize[1]);
                const data = imageData.data;
                
                // Normalize for CLIP (ImageNet normalization)
                const mean = [0.485, 0.456, 0.406];
                const std = [0.229, 0.224, 0.225];
                
                const input = new Float32Array(3 * targetSize[0] * targetSize[1]);
                let idx = 0;
                
                for (let c = 0; c < 3; c++) {
                    for (let h = 0; h < targetSize[1]; h++) {
                        for (let w = 0; w < targetSize[0]; w++) {
                            const pixelIdx = (h * targetSize[0] + w) * 4;
                            const pixelValue = data[pixelIdx + c] / 255.0;
                            input[idx++] = (pixelValue - mean[c]) / std[c];
                        }
                    }
                }
                
                const tensor = new this.ort.Tensor('float32', input, [1, 3, targetSize[1], targetSize[0]]);
                resolve(tensor);
            };
            img.src = imageDataUrl;
        });
    }

    processYoloResults(results, taskType, imageCount) {
        // This is a simplified version - actual YOLO result processing is more complex
        const response = new Array(imageCount).fill(false);
        const coordinates = [];
        
        try {
            // YOLO outputs: boxes, scores, classes, masks (for segmentation)
            const boxes = results.output0?.data || results.boxes?.data;
            const scores = results.output1?.data || results.scores?.data;
            const classes = results.output2?.data || results.classes?.data;
            
            if (boxes && scores && classes) {
                // Process detections and map to tile grid
                for (let i = 0; i < scores.length; i++) {
                    if (scores[i] > 0.5) { // Confidence threshold
                        const classId = Math.round(classes[i]);
                        const className = this.config.models.yolo.classes[classId];
                        
                        if (this.matchesTaskType(className, taskType)) {
                            // Calculate which tiles this detection covers
                            const tileIdx = this.calculateTileIndex(boxes.slice(i * 4, i * 4 + 4), imageCount);
                            if (tileIdx >= 0 && tileIdx < imageCount) {
                                response[tileIdx] = true;
                                coordinates.push(this.calculateClickCoordinates(boxes.slice(i * 4, i * 4 + 4)));
                            }
                        }
                    }
                }
            }
        } catch (error) {
            console.error('Error processing YOLO results:', error);
        }
        
        return {
            response,
            coordinates,
            confidence: 0.8 // Average confidence
        };
    }

    async clipClassifyImages(images, taskType, visionModel, textModel) {
        const response = [];
        const coordinates = [];
        
        // Create text embeddings for all possible labels
        const textInputs = this.createTextInputs([taskType]);
        const textResults = await textModel.run(textInputs);
        const textFeatures = textResults.text_features;
        
        // Process each image
        for (let i = 0; i < images.length; i++) {
            try {
                const imageTensor = await this.preprocessImageForClip(images[i].dataUrl);
                const visionResults = await visionModel.run({ pixel_values: imageTensor });
                const imageFeatures = visionResults.image_features;
                
                // Calculate similarity
                const similarity = this.calculateCosineSimilarity(imageFeatures.data, textFeatures.data);
                const prediction = similarity > 0.3; // Threshold
                
                response.push(prediction);
                
                if (prediction) {
                    // Calculate click coordinates for this tile
                    const rect = images[i].rect || { width: 100, height: 100 };
                    coordinates.push([rect.width / 2, rect.height / 2]);
                }
            } catch (error) {
                console.error(`Error processing image ${i}:`, error);
                response.push(false);
            }
        }
        
        return {
            response,
            coordinates,
            confidence: 0.7
        };
    }

    async clipSegmentArea(images, taskType, clipsegModel) {
        // Combine images into grid if multiple
        let inputImage = images.length === 1 ? images[0].dataUrl : this.createImageGrid(images);
        
        // Preprocess for CLIPSeg
        const imageTensor = await this.preprocessImageForClip(inputImage, [352, 352]);
        const textInputs = this.createTextInputs([taskType]);
        
        // Run CLIPSeg inference
        const results = await clipsegModel.run({
            pixel_values: imageTensor,
            ...textInputs
        });
        
        // Process segmentation results
        const logits = results.logits;
        const response = this.processSegmentationMask(logits.data, images.length);
        const coordinates = this.calculateAreaCoordinates(response, images.length);
        
        return {
            response,
            coordinates,
            confidence: 0.75
        };
    }

    createTextInputs(texts) {
        // Simplified tokenization - in real implementation, you'd need proper tokenization
        const inputIds = [];
        const attentionMask = [];
        const maxLength = 77; // CLIP max sequence length
        
        texts.forEach(text => {
            // This is a very simplified tokenizer - you'd need a proper one
            const tokens = text.toLowerCase().split(' ').slice(0, maxLength - 2);
            const ids = [49406]; // Start token
            
            tokens.forEach(token => {
                // Simple hash-based token ID (not accurate, just for demo)
                ids.push(Math.abs(this.simpleHash(token)) % 49407 + 1);
            });
            
            ids.push(49407); // End token
            
            // Pad to max length
            while (ids.length < maxLength) {
                ids.push(0);
            }
            
            inputIds.push(...ids);
            attentionMask.push(...ids.map(id => id > 0 ? 1 : 0));
        });
        
        return {
            input_ids: new this.ort.Tensor('int64', new BigInt64Array(inputIds.map(BigInt)), [texts.length, maxLength]),
            attention_mask: new this.ort.Tensor('int64', new BigInt64Array(attentionMask.map(BigInt)), [texts.length, maxLength])
        };
    }

    simpleHash(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        return hash;
    }

    calculateCosineSimilarity(vecA, vecB) {
        let dotProduct = 0;
        let normA = 0;
        let normB = 0;
        
        for (let i = 0; i < vecA.length; i++) {
            dotProduct += vecA[i] * vecB[i];
            normA += vecA[i] * vecA[i];
            normB += vecB[i] * vecB[i];
        }
        
        return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
    }

    matchesTaskType(className, taskType) {
        const alias = this.config.labels.yolo_alias || {};
        const allowedClasses = alias[taskType] || [taskType];
        return allowedClasses.includes(className);
    }

    calculateTileIndex(box, totalTiles) {
        // Convert box coordinates to tile index
        const tilesPerRow = Math.sqrt(totalTiles);
        const x = (box[0] + box[2]) / 2; // Center x
        const y = (box[1] + box[3]) / 2; // Center y
        
        const tileX = Math.floor(x * tilesPerRow);
        const tileY = Math.floor(y * tilesPerRow);
        
        return tileY * tilesPerRow + tileX;
    }

    calculateClickCoordinates(box) {
        const centerX = (box[0] + box[2]) / 2;
        const centerY = (box[1] + box[3]) / 2;
        return [centerX, centerY];
    }

    calculateAreaCoordinates(response, imageCount) {
        const coordinates = [];
        const tilesPerRow = Math.sqrt(imageCount);
        const tileSize = 100; // Approximate tile size
        
        response.forEach((shouldClick, index) => {
            if (shouldClick) {
                const row = Math.floor(index / tilesPerRow);
                const col = index % tilesPerRow;
                const x = col * tileSize + tileSize / 2;
                const y = row * tileSize + tileSize / 2;
                coordinates.push([x, y]);
            }
        });
        
        return coordinates;
    }

    processSegmentationMask(maskData, imageCount) {
        const response = new Array(imageCount).fill(false);
        const threshold = 0.5;
        
        // This is simplified - actual implementation would properly process the segmentation mask
        const tilesPerRow = Math.sqrt(imageCount);
        const maskSize = Math.sqrt(maskData.length);
        const tileSize = maskSize / tilesPerRow;
        
        for (let i = 0; i < imageCount; i++) {
            const row = Math.floor(i / tilesPerRow);
            const col = i % tilesPerRow;
            
            // Sample the mask in the tile area
            let sum = 0;
            let count = 0;
            for (let y = row * tileSize; y < (row + 1) * tileSize; y++) {
                for (let x = col * tileSize; x < (col + 1) * tileSize; x++) {
                    if (y < maskSize && x < maskSize) {
                        sum += maskData[Math.floor(y) * maskSize + Math.floor(x)];
                        count++;
                    }
                }
            }
            
            response[i] = count > 0 && (sum / count) > threshold;
        }
        
        return response;
    }

    createImageGrid(images) {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        const tilesPerRow = Math.sqrt(images.length);
        const tileSize = 224; // Standard size
        canvas.width = tilesPerRow * tileSize;
        canvas.height = tilesPerRow * tileSize;
        
        images.forEach((imageData, index) => {
            const img = new Image();
            img.onload = () => {
                const row = Math.floor(index / tilesPerRow);
                const col = index % tilesPerRow;
                ctx.drawImage(img, col * tileSize, row * tileSize, tileSize, tileSize);
            };
            img.src = imageData.dataUrl || imageData;
        });
        
        return canvas.toDataURL();
    }

    getStatus() {
        return {
            loaded: this.isLoaded,
            modelCount: Object.keys(this.models).length,
            availableModels: Object.keys(this.config?.models || {})
        };
    }
}

// Export for use in background script
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AIDetectionEngine;
}

// Make available globally for content scripts
if (typeof window !== 'undefined') {
    window.AIDetectionEngine = AIDetectionEngine;
}