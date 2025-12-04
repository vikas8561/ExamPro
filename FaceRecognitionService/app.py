"""
Face Recognition Service using DeepFace (VGG-Face)
This service compares a captured image with a user's profile image
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import os

app = Flask(__name__)
CORS(app)

# Try to import face recognition libraries
FACE_RECOGNITION_AVAILABLE = False
try:
    import cv2
    import numpy as np
    import base64
    import io
    from PIL import Image
    from deepface import DeepFace
    
    print("DeepFace library loaded successfully!")
    FACE_RECOGNITION_AVAILABLE = True
except ImportError as e:
    print(f"Warning: Face recognition libraries not available: {e}")
    print("Service will run in fallback mode - rejecting all face verifications")
    FACE_RECOGNITION_AVAILABLE = False
except Exception as e:
    print(f"Warning: Could not initialize DeepFace: {e}")
    print("Service will run in fallback mode - rejecting all face verifications")
    FACE_RECOGNITION_AVAILABLE = False

def base64_to_image(base64_string):
    """Convert base64 string to OpenCV image"""
    try:
        # Remove data URL prefix if present
        if ',' in base64_string:
            base64_string = base64_string.split(',')[1]
        
        # Decode base64
        image_data = base64.b64decode(base64_string)
        
        # Convert to PIL Image
        pil_image = Image.open(io.BytesIO(image_data))
        
        # Convert to RGB if necessary
        if pil_image.mode != 'RGB':
            pil_image = pil_image.convert('RGB')
        
        # Convert to numpy array
        img_array = np.array(pil_image)
        
        # Convert RGB to BGR for OpenCV
        img_bgr = cv2.cvtColor(img_array, cv2.COLOR_RGB2BGR)
        
        return img_bgr
    except Exception as e:
        print(f"Error converting base64 to image: {e}")
        return None

def extract_face_embedding(image):
    """Extract face embedding using DeepFace"""
    if not FACE_RECOGNITION_AVAILABLE:
        return None
    try:
        # DeepFace can extract embeddings directly from image
        # Using VGG-Face model which is accurate and fast
        embedding = DeepFace.represent(
            img_path=image,
            model_name='VGG-Face',
            enforce_detection=True,
            detector_backend='opencv'
        )
        
        if len(embedding) == 0:
            return None
        
        # Get the first (and usually only) face embedding
        # DeepFace returns a list of dictionaries with 'embedding' key
        face_embedding = embedding[0]['embedding']
        
        # Convert to numpy array
        return np.array(face_embedding)
    except Exception as e:
        print(f"Error extracting face embedding: {e}")
        return None

def cosine_similarity(embedding1, embedding2):
    """Calculate cosine similarity between two embeddings"""
    if not FACE_RECOGNITION_AVAILABLE:
        return 0.0
    try:
        # Normalize embeddings
        norm1 = np.linalg.norm(embedding1)
        norm2 = np.linalg.norm(embedding2)
        
        if norm1 == 0 or norm2 == 0:
            return 0.0
        
        # Calculate cosine similarity
        similarity = np.dot(embedding1, embedding2) / (norm1 * norm2)
        return float(similarity)
    except Exception as e:
        print(f"Error calculating cosine similarity: {e}")
        return 0.0

@app.route('/', methods=['GET'])
def root():
    """Root endpoint for Render health checks"""
    return jsonify({
        'status': 'healthy',
        'service': 'face-recognition',
        'model': 'VGG-Face' if FACE_RECOGNITION_AVAILABLE else 'fallback',
        'available': FACE_RECOGNITION_AVAILABLE,
        'message': 'Face Recognition Service is running'
    })

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'service': 'face-recognition',
        'model': 'VGG-Face' if FACE_RECOGNITION_AVAILABLE else 'fallback',
        'available': FACE_RECOGNITION_AVAILABLE
    })

@app.route('/verify-face', methods=['POST'])
def verify_face():
    """Verify if captured image matches profile image"""
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({
                'error': 'No data provided',
                'match': False
            }), 400
        
        profile_image_b64 = data.get('profileImage')
        captured_image_b64 = data.get('capturedImage')
        
        if not profile_image_b64 or not captured_image_b64:
            return jsonify({
                'error': 'Both profileImage and capturedImage are required',
                'match': False
            }), 400
        
        # If face recognition is not available, reject verification
        if not FACE_RECOGNITION_AVAILABLE:
            print("ERROR: Face recognition not available - REJECTING verification")
            return jsonify({
                'match': False,
                'confidence': 0.0,
                'threshold': 0.6,
                'error': 'Face recognition service is not properly configured. Please install required libraries.',
                'message': 'Face verification failed - service not available'
            }), 503
        
        # Convert base64 strings to images and save temporarily for DeepFace
        import tempfile
        import os
        
        profile_image = base64_to_image(profile_image_b64)
        captured_image = base64_to_image(captured_image_b64)
        
        if profile_image is None or captured_image is None:
            return jsonify({
                'error': 'Failed to decode images',
                'match': False
            }), 400
        
        # Save images to temporary files (DeepFace needs file paths)
        with tempfile.NamedTemporaryFile(delete=False, suffix='.jpg') as profile_file:
            cv2.imwrite(profile_file.name, profile_image)
            profile_path = profile_file.name
        
        with tempfile.NamedTemporaryFile(delete=False, suffix='.jpg') as captured_file:
            cv2.imwrite(captured_file.name, captured_image)
            captured_path = captured_file.name
        
        try:
            # Use DeepFace to verify faces directly
            # This is more accurate than comparing embeddings manually
            print("Verifying faces with DeepFace...")
            try:
                result = DeepFace.verify(
                    img1_path=profile_path,
                    img2_path=captured_path,
                    model_name='VGG-Face',
                    distance_metric='cosine',
                    enforce_detection=True,
                    detector_backend='opencv'
                )
            except Exception as e:
                # Catch DeepFace exceptions and provide user-friendly messages
                error_msg = str(e).lower()
                error_full = str(e)
                print(f"DeepFace error: {error_full}")
                
                # Check for common error patterns - be more specific
                if 'img1_path' in error_msg or ('exception while processing' in error_msg and 'img1' in error_msg):
                    user_message = 'No face detected in your profile image. Please ensure your face is clearly visible.'
                elif 'img2_path' in error_msg or ('exception while processing' in error_msg and 'img2' in error_msg) or 'exception while processing' in error_msg:
                    user_message = 'No face detected in the captured image. Please ensure your face is clearly visible and try again.'
                elif 'no face' in error_msg or 'face could not be detected' in error_msg or 'could not detect' in error_msg:
                    user_message = 'Could not detect a face in the image. Please ensure your face is clearly visible, well-lit, and facing the camera.'
                else:
                    # Default message for any other error
                    user_message = 'Face verification failed. Please ensure your face is clearly visible and try again.'
                
                # Return the user-friendly message
                return jsonify({
                    'match': False,
                    'confidence': 0.0,
                    'threshold': 0.7,
                    'message': user_message,
                    'error': 'Face detection error'
                }), 400
            
            # DeepFace returns: {'verified': True/False, 'distance': float, 'threshold': float}
            verified = result['verified']
            distance = result['distance']
            threshold_used = result['threshold']
            
            # Convert distance to similarity (cosine distance -> similarity)
            # Cosine distance: 0 = identical, 1 = completely different
            # Cosine similarity: 1 = identical, 0 = completely different
            # similarity = 1 - distance (for cosine)
            similarity = 1.0 - distance
            
            # For VGG-Face with cosine distance, threshold is typically around 0.68
            # Lower distance = more similar
            # We'll use the threshold from DeepFace but also check similarity >= 0.7
            
            match = verified and similarity >= 0.7
            
            # Log the verification result for debugging
            print(f"Face verification result:")
            print(f"  - Verified: {verified}")
            print(f"  - Distance: {distance:.4f}")
            print(f"  - Similarity: {similarity:.4f}")
            print(f"  - Threshold: {threshold_used:.4f}")
            print(f"  - Match: {match}")
            print(f"  - Status: {'✅ VERIFIED' if match else '❌ REJECTED'}")
            
            return jsonify({
                'match': bool(match),
                'confidence': float(similarity),
                'threshold': 0.7,
                'message': 'Face verification completed' if match else 'Face verification failed - faces do not match'
            })
            
        finally:
            # Clean up temporary files
            try:
                os.unlink(profile_path)
                os.unlink(captured_path)
            except:
                pass
        
    except Exception as e:
        # This outer exception handler should rarely be hit if inner handlers work correctly
        error_msg = str(e).lower()
        print(f"Unexpected error in verify_face: {e}")
        
        # Try to provide user-friendly message even for unexpected errors
        if 'img2_path' in error_msg or 'exception while processing' in error_msg:
            user_message = 'No face detected in the captured image. Please ensure your face is clearly visible and try again.'
        elif 'img1_path' in error_msg:
            user_message = 'No face detected in your profile image. Please ensure your face is clearly visible.'
        else:
            user_message = 'Face verification failed. Please ensure your face is clearly visible and try again.'
        
        return jsonify({
            'error': 'Face verification error',
            'message': user_message,
            'match': False
        }), 500

if __name__ == '__main__':
    # Render provides PORT environment variable automatically
    port = int(os.environ.get('PORT', 5000))
    # Must bind to 0.0.0.0 for Render to detect the port
    app.run(host='0.0.0.0', port=port, debug=False)

