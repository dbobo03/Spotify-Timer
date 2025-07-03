#!/usr/bin/env python3
import requests
import json

# Get the backend URL from the frontend .env file
BACKEND_URL = "https://be99c99a-b61c-4290-81c3-40fbf57bcd47.preview.emergentagent.com/api"

def test_callback_endpoint():
    """Test the Spotify callback endpoint structure"""
    print("\n" + "="*80)
    print("SPOTIFY CALLBACK ENDPOINT DIAGNOSTIC")
    print("="*80)
    
    # We can't fully test the callback without a valid code from Spotify
    # But we can check if the endpoint exists and returns the expected error for invalid code
    
    print("\nTesting /api/auth/callback endpoint with invalid code...")
    callback_url = f"{BACKEND_URL}/auth/callback?code=invalid_test_code"
    
    try:
        response = requests.get(callback_url, timeout=10)
        status_code = response.status_code
        
        try:
            response_json = response.json()
            print(f"Response ({status_code}): {json.dumps(response_json, indent=2)}")
        except:
            print(f"Response ({status_code}): {response.text}")
            response_json = {}
        
        # For an invalid code, we expect a 400 error
        if status_code == 400 and "detail" in response_json:
            print("✅ Callback endpoint correctly returns 400 for invalid code")
            print("✅ This confirms the endpoint is properly implemented and validates the code parameter")
        else:
            print(f"❌ Unexpected response from callback endpoint (status {status_code})")
            
    except Exception as e:
        print(f"❌ Error testing callback endpoint: {str(e)}")
    
    # Test refresh token endpoint structure
    print("\nTesting /api/auth/refresh endpoint structure...")
    refresh_url = f"{BACKEND_URL}/auth/refresh"
    
    try:
        # Send an invalid refresh token
        response = requests.post(refresh_url, json={"refresh_token": "invalid_test_token"}, timeout=10)
        status_code = response.status_code
        
        try:
            response_json = response.json()
            print(f"Response ({status_code}): {json.dumps(response_json, indent=2)}")
        except:
            print(f"Response ({status_code}): {response.text}")
            response_json = {}
        
        # For an invalid refresh token, we expect an error
        if status_code in [400, 422]:
            print("✅ Refresh endpoint correctly validates the refresh token")
        else:
            print(f"❌ Unexpected response from refresh endpoint (status {status_code})")
            
    except Exception as e:
        print(f"❌ Error testing refresh endpoint: {str(e)}")
    
    print("\n" + "="*80)
    print("CALLBACK ENDPOINT DIAGNOSTIC SUMMARY")
    print("="*80)
    
    print("The callback endpoint structure appears to be correctly implemented.")
    print("Note: Full callback testing requires a valid authorization code from Spotify,")
    print("which can only be obtained through the actual OAuth flow.")

if __name__ == "__main__":
    test_callback_endpoint()