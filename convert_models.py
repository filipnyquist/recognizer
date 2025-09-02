#!/usr/bin/env python3
"""
Model converter script to convert PyTorch models to ONNX format for browser usage
"""

import os
import sys
import torch
import numpy as np
from pathlib import Path
from typing import Dict, Any

# Add recognizer package to path
sys.path.insert(0, str(Path(__file__).parent.parent))

try:
    from recognizer.components.detector import detection_models
    from transformers import CLIPModel, CLIPProcessor, CLIPSegForImageSegmentation, CLIPSegProcessor
    from ultralytics import YOLO
except ImportError as e:
    print(f"Error importing required packages: {e}")
    print("Please install the required dependencies first:")
    print("pip install -r requirements.txt")
    sys.exit(1)

class ModelConverter:
    def __init__(self, output_dir: str = "browser-extension/models"):
        self.output_dir = Path(__file__).parent / output_dir
        self.output_dir.mkdir(exist_ok=True)
        print(f"Output directory: {self.output_dir}")

    def convert_clip_vit_model(self):
        """Convert CLIP ViT model to ONNX"""
        print("Converting CLIP ViT model...")
        
        try:
            # Load the model and processor
            model = CLIPModel.from_pretrained("flavour/CLIP-ViT-B-16-DataComp.XL-s13B-b90K")
            processor = CLIPProcessor.from_pretrained("flavour/CLIP-ViT-B-16-DataComp.XL-s13B-b90K")
            
            model.eval()
            
            # Create dummy inputs
            dummy_text = ["a bicycle", "a car", "a bus"]  # Example text inputs
            dummy_images = torch.rand(1, 3, 224, 224)  # Batch of 1 image
            
            # Process inputs
            inputs = processor(text=dummy_text, images=dummy_images, return_tensors="pt", padding=True)
            
            # Export text encoder
            torch.onnx.export(
                model.text_model,
                (inputs['input_ids'], inputs['attention_mask']),
                self.output_dir / "clip_text_encoder.onnx",
                export_params=True,
                opset_version=11,
                do_constant_folding=True,
                input_names=['input_ids', 'attention_mask'],
                output_names=['text_features'],
                dynamic_axes={
                    'input_ids': {0: 'batch_size', 1: 'sequence'},
                    'attention_mask': {0: 'batch_size', 1: 'sequence'},
                    'text_features': {0: 'batch_size'}
                }
            )
            
            # Export vision encoder
            torch.onnx.export(
                model.vision_model,
                inputs['pixel_values'],
                self.output_dir / "clip_vision_encoder.onnx",
                export_params=True,
                opset_version=11,
                do_constant_folding=True,
                input_names=['pixel_values'],
                output_names=['image_features'],
                dynamic_axes={
                    'pixel_values': {0: 'batch_size'},
                    'image_features': {0: 'batch_size'}
                }
            )
            
            print("✓ CLIP ViT models converted successfully")
            
        except Exception as e:
            print(f"✗ Failed to convert CLIP ViT model: {e}")

    def convert_clipseg_model(self):
        """Convert CLIPSeg model to ONNX"""
        print("Converting CLIPSeg model...")
        
        try:
            model = CLIPSegForImageSegmentation.from_pretrained("CIDAS/clipseg-rd64-refined")
            processor = CLIPSegProcessor.from_pretrained("CIDAS/clipseg-rd64-refined")
            
            model.eval()
            
            # Create dummy inputs
            dummy_text = "a bicycle"
            dummy_image = torch.rand(1, 3, 352, 352)  # CLIPSeg expects 352x352
            
            inputs = processor(text=dummy_text, images=dummy_image, return_tensors="pt")
            
            # Export the model
            torch.onnx.export(
                model,
                (inputs['input_ids'], inputs['pixel_values'], inputs['attention_mask']),
                self.output_dir / "clipseg.onnx",
                export_params=True,
                opset_version=11,
                do_constant_folding=True,
                input_names=['input_ids', 'pixel_values', 'attention_mask'],
                output_names=['logits'],
                dynamic_axes={
                    'input_ids': {0: 'batch_size', 1: 'sequence'},
                    'pixel_values': {0: 'batch_size'},
                    'attention_mask': {0: 'batch_size', 1: 'sequence'},
                    'logits': {0: 'batch_size'}
                }
            )
            
            print("✓ CLIPSeg model converted successfully")
            
        except Exception as e:
            print(f"✗ Failed to convert CLIPSeg model: {e}")

    def convert_yolo_model(self):
        """Convert YOLO model to ONNX"""
        print("Converting YOLO model...")
        
        try:
            # Load YOLO model
            model = YOLO("yolo11m-seg.pt")
            
            # Export to ONNX
            model.export(
                format="onnx",
                imgsz=640,
                optimize=True,
                half=False,
                simplify=True,
                opset=11
            )
            
            # Move the generated ONNX file to our output directory
            yolo_onnx_path = Path("yolo11m-seg.onnx")
            if yolo_onnx_path.exists():
                yolo_onnx_path.rename(self.output_dir / "yolo11m-seg.onnx")
                print("✓ YOLO model converted successfully")
            else:
                print("✗ YOLO ONNX file not found after export")
                
        except Exception as e:
            print(f"✗ Failed to convert YOLO model: {e}")

    def save_model_config(self):
        """Save model configuration for the browser extension"""
        config = {
            "models": {
                "yolo": {
                    "path": "models/yolo11m-seg.onnx",
                    "input_size": [640, 640],
                    "classes": [
                        'person', 'bicycle', 'car', 'motorcycle', 'airplane', 'bus', 'train', 'truck', 'boat', 
                        'traffic light', 'fire hydrant', 'stop sign', 'parking meter', 'bench', 'bird', 'cat', 
                        'dog', 'horse', 'sheep', 'cow', 'elephant', 'bear', 'zebra', 'giraffe', 'backpack', 
                        'umbrella', 'handbag', 'tie', 'suitcase', 'frisbee', 'skis', 'snowboard', 'sports ball', 
                        'kite', 'baseball bat', 'baseball glove', 'skateboard', 'surfboard', 'tennis racket', 
                        'bottle', 'wine glass', 'cup', 'fork', 'knife', 'spoon', 'bowl', 'banana', 'apple', 
                        'sandwich', 'orange', 'broccoli', 'carrot', 'hot dog', 'pizza', 'donut', 'cake', 
                        'chair', 'couch', 'potted plant', 'bed', 'dining table', 'toilet', 'tv', 'laptop', 
                        'mouse', 'remote', 'keyboard', 'cell phone', 'microwave', 'oven', 'toaster', 'sink', 
                        'refrigerator', 'book', 'clock', 'vase', 'scissors', 'teddy bear', 'hair drier', 'toothbrush'
                    ]
                },
                "clip_vision": {
                    "path": "models/clip_vision_encoder.onnx",
                    "input_size": [224, 224]
                },
                "clip_text": {
                    "path": "models/clip_text_encoder.onnx",
                    "vocab_size": 49408
                },
                "clipseg": {
                    "path": "models/clipseg.onnx",
                    "input_size": [352, 352]
                }
            },
            "labels": {
                "yolo_alias": {
                    "bicycle": ["bicycle"],
                    "car": ["car", "truck"],
                    "bus": ["bus", "truck"],
                    "motorcycle": ["motorcycle"],
                    "boat": ["boat"],
                    "fire hydrant": ["fire hydrant", "parking meter"],
                    "parking meter": ["fire hydrant", "parking meter"],
                    "traffic light": ["traffic light"]
                },
                "clip_labels": [
                    "bicycle", "boat", "bus", "car", "fire hydrant", "motorcycle", "traffic light",
                    "bridge", "chimney", "crosswalk", "mountain", "palm tree", "stair", "tractor", "taxi"
                ],
                "challenge_alias": {
                    "car": "car", "cars": "car", "vehicles": "car",
                    "taxis": "taxi", "taxi": "taxi",
                    "bus": "bus", "buses": "bus",
                    "motorcycle": "motorcycle", "motorcycles": "motorcycle",
                    "bicycle": "bicycle", "bicycles": "bicycle",
                    "boats": "boat", "boat": "boat",
                    "tractors": "tractor", "tractor": "tractor",
                    "stairs": "stair", "stair": "stair",
                    "palm trees": "palm tree", "palm tree": "palm tree",
                    "fire hydrants": "fire hydrant", "a fire hydrant": "fire hydrant", "fire hydrant": "fire hydrant",
                    "parking meters": "parking meter", "parking meter": "parking meter",
                    "crosswalks": "crosswalk", "crosswalk": "crosswalk",
                    "traffic lights": "traffic light", "traffic light": "traffic light",
                    "bridges": "bridge", "bridge": "bridge",
                    "mountains or hills": "mountain", "mountain or hill": "mountain", "mountain": "mountain", 
                    "mountains": "mountain", "hills": "mountain", "hill": "mountain",
                    "chimney": "chimney", "chimneys": "chimney"
                },
                "thresholds": {
                    "bridge": 0.7285372716747225,
                    "chimney": 0.7918647485226393,
                    "crosswalk": 0.8879293048381806,
                    "mountain": 0.5551278884819476,
                    "palm tree": 0.8093279512040317,
                    "stair": 0.9112694561691023,
                    "tractor": 0.9385110986077537,
                    "taxi": 0.7967491503432393
                }
            }
        }
        
        import json
        with open(self.output_dir / "config.json", "w") as f:
            json.dump(config, f, indent=2)
        
        print("✓ Model configuration saved")

    def convert_all(self):
        """Convert all models"""
        print("Starting model conversion...")
        
        # Ensure models are loaded first
        print("Loading PyTorch models...")
        try:
            detection_models.check_loaded()
            print("✓ PyTorch models loaded")
        except Exception as e:
            print(f"✗ Failed to load PyTorch models: {e}")
            return
        
        # Convert models
        self.convert_yolo_model()
        self.convert_clip_vit_model()
        self.convert_clipseg_model()
        self.save_model_config()
        
        print("\nModel conversion completed!")
        print(f"Models saved to: {self.output_dir}")
        print("\nNext steps:")
        print("1. Copy the browser-extension folder to your preferred location")
        print("2. Load the extension in Chrome/Edge developer mode")
        print("3. Test on reCAPTCHA demo sites")

if __name__ == "__main__":
    converter = ModelConverter()
    converter.convert_all()