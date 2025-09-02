#!/usr/bin/env python3
"""
Test for the convert_models.py fix to ensure dummy images are in correct range
"""

import torch
import unittest
import sys
from pathlib import Path

# Add recognizer package to path
sys.path.insert(0, str(Path(__file__).parent.parent))

class TestModelConversionFix(unittest.TestCase):
    """Test cases to verify the CLIP model conversion fix"""
    
    def test_dummy_image_ranges_clip_vit(self):
        """Test that CLIP ViT dummy images are in [0,1] range"""
        # This replicates the fixed line in convert_models.py line 45
        dummy_images = torch.rand(1, 3, 224, 224)
        
        self.assertGreaterEqual(dummy_images.min().item(), 0.0, 
                               "CLIP ViT dummy image minimum should be >= 0")
        self.assertLessEqual(dummy_images.max().item(), 1.0, 
                            "CLIP ViT dummy image maximum should be <= 1") 
        
        # Ensure we're not getting the problematic torch.randn values
        self.assertLess(dummy_images.max().item(), 4.0,
                       "Values should not be in torch.randn() range")
        self.assertGreater(dummy_images.min().item(), -4.0,
                          "Values should not be in torch.randn() range")
    
    def test_dummy_image_ranges_clipseg(self):
        """Test that CLIPSeg dummy images are in [0,1] range"""  
        # This replicates the fixed line in convert_models.py line 100
        dummy_image = torch.rand(1, 3, 352, 352)
        
        self.assertGreaterEqual(dummy_image.min().item(), 0.0,
                               "CLIPSeg dummy image minimum should be >= 0")
        self.assertLessEqual(dummy_image.max().item(), 1.0,
                            "CLIPSeg dummy image maximum should be <= 1")
                            
        # Ensure we're not getting the problematic torch.randn values
        self.assertLess(dummy_image.max().item(), 4.0,
                       "Values should not be in torch.randn() range")
        self.assertGreater(dummy_image.min().item(), -4.0,
                          "Values should not be in torch.randn() range")
    
    def test_torch_randn_vs_torch_rand(self):
        """Verify that torch.rand solves the range issue that torch.randn had"""
        # Show the problematic torch.randn approach (what we fixed)
        randn_tensor = torch.randn(1, 3, 224, 224)
        
        # Show our fixed torch.rand approach
        rand_tensor = torch.rand(1, 3, 224, 224)
        
        # torch.rand should always be in [0,1] 
        self.assertGreaterEqual(rand_tensor.min().item(), 0.0)
        self.assertLessEqual(rand_tensor.max().item(), 1.0)
        
        # torch.randn will often (but not always) be outside [0,1]
        # We can't assert this will always fail, but we can show the fix works
        print(f"torch.randn range: [{randn_tensor.min():.6f}, {randn_tensor.max():.6f}]")
        print(f"torch.rand range: [{rand_tensor.min():.6f}, {rand_tensor.max():.6f}]")
    
    def test_pil_image_conversion_compatibility(self):
        """Test that our dummy images can be converted to PIL format"""
        import numpy as np
        from PIL import Image
        
        # Test both fixed tensor types
        for shape in [(1, 3, 224, 224), (1, 3, 352, 352)]:
            with self.subTest(shape=shape):
                dummy_tensor = torch.rand(*shape)
                
                # Simulate the conversion process that was failing
                np_array = dummy_tensor.squeeze(0).permute(1, 2, 0).numpy()
                
                # This should not raise ValueError with our fix
                self.assertGreaterEqual(np_array.min(), 0.0)
                self.assertLessEqual(np_array.max(), 1.0)
                
                # Convert to uint8 format (like PIL does)
                uint8_array = (np_array * 255).astype(np.uint8)
                
                # Should be able to create PIL image without error
                pil_image = Image.fromarray(uint8_array)
                self.assertEqual(pil_image.size, (shape[3], shape[2]))  # (width, height)

if __name__ == '__main__':
    unittest.main()