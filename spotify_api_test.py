#!/usr/bin/env python3
import requests
import json
import urllib.parse

# Get the backend URL from the frontend .env file
BACKEND_URL = "https://be99c99a-b61c-4290-81c3-40fbf57bcd47.preview.emergentagent.com/api"

# Test results tracking
test_results = {
    "passed": 0,
    "failed": 0,
    "tests": []
}

def run_test(test_name, endpoint, method="GET", data=None, params=None, expected_status=200, expected_content=None):
    """Run a test against an API endpoint and record the result"""
    url = f"{BACKEND_URL}{endpoint}"
    print(f"\n{'='*80}\nTEST: {test_name}\nURL: {url}\nMethod: {method}")
    
    if params:
        print(f"Params: {params}")
    if data:
        print(f"Data: {data}")
    
    try:
        if method == "GET":
            response = requests.get(url, params=params, timeout=10)
        elif method == "POST":
            response = requests.post(url, json=data, params=params, timeout=10)
        elif method == "PUT":
            response = requests.put(url, json=data, params=params, timeout=10)
        else:
            raise ValueError(f"Unsupported method: {method}")
        
        status_code = response.status_code
        try:
            response_json = response.json()
            print(f"Response ({status_code}): {json.dumps(response_json, indent=2)}")
        except:
            print(f"Response ({status_code}): {response.text}")
            response_json = {}
        
        # Check if status code matches expected
        status_match = status_code == expected_status
        
        # Check if response content matches expected (if provided)
        content_match = True
        if expected_content:
            for key, value in expected_content.items():
                if key not in response_json or response_json[key] != value:
                    content_match = False
                    break
        
        # Determine if test passed
        passed = status_match and content_match
        
        # Record test result
        test_results["tests"].append({
            "name": test_name,
            "passed": passed,
            "status_code": status_code,
            "expected_status": expected_status,
            "response": response_json
        })
        
        if passed:
            test_results["passed"] += 1
            print(f"✅ TEST PASSED: {test_name}")
        else:
            test_results["failed"] += 1
            print(f"❌ TEST FAILED: {test_name}")
            if not status_match:
                print(f"  Expected status {expected_status}, got {status_code}")
            if not content_match:
                print(f"  Response content did not match expected content")
        
        return response_json, passed
    
    except Exception as e:
        print(f"❌ TEST ERROR: {str(e)}")
        test_results["failed"] += 1
        test_results["tests"].append({
            "name": test_name,
            "passed": False,
            "error": str(e)
        })
        return None, False

def print_summary():
    """Print a summary of all test results"""
    print("\n" + "="*80)
    print(f"TEST SUMMARY: {test_results['passed']} passed, {test_results['failed']} failed")
    print("="*80)
    
    # Print details of failed tests
    if test_results["failed"] > 0:
        print("\nFAILED TESTS:")
        for test in test_results["tests"]:
            if not test.get("passed", False):
                print(f"- {test['name']}")
                if "error" in test:
                    print(f"  Error: {test['error']}")
                elif "status_code" in test:
                    print(f"  Status: {test['status_code']} (expected {test['expected_status']})")
    print("="*80)

def main():
    print("Starting Spotify API Validation Tests...")
    
    # 1. Test GET /api/spotify/devices without access token (should fail with 422)
    run_test(
        "Get Devices Without Access Token", 
        "/spotify/devices", 
        expected_status=422  # Expecting validation error for missing required parameter
    )
    
    # 2. Test GET /api/spotify/devices with invalid access token (should fail with 400)
    run_test(
        "Get Devices With Invalid Access Token", 
        "/spotify/devices", 
        params={"access_token": "invalid_token"},
        expected_status=400  # Expecting error due to invalid token
    )
    
    # 3. Test PUT /api/spotify/transfer-playback without access token (should fail with 422)
    run_test(
        "Transfer Playback Without Access Token", 
        "/spotify/transfer-playback", 
        method="PUT",
        data={"device_ids": ["device_id_1"]},
        expected_status=422  # Expecting validation error for missing required parameter
    )
    
    # 4. Test PUT /api/spotify/transfer-playback with access token but invalid data (should fail with 422)
    run_test(
        "Transfer Playback With Invalid Data", 
        "/spotify/transfer-playback", 
        method="PUT",
        params={"access_token": "invalid_token"},
        data={},  # Missing required device_ids field
        expected_status=422  # Expecting validation error for missing required field
    )
    
    # 5. Test PUT /api/spotify/transfer-playback with valid structure but invalid token
    run_test(
        "Transfer Playback With Valid Structure", 
        "/spotify/transfer-playback", 
        method="PUT",
        params={"access_token": "invalid_token"},
        data={"device_ids": ["device_id_1"], "play": True},
        expected_status=400  # Expecting error due to invalid token, but structure is valid
    )
    
    # 6. Test POST /api/spotify/play without access token (should fail with 422)
    run_test(
        "Play Track Without Access Token", 
        "/spotify/play", 
        method="POST",
        data={"track_uri": "spotify:track:1234567890"},
        expected_status=422  # Expecting validation error for missing required parameter
    )
    
    # 7. Test POST /api/spotify/play with access token but invalid data (should fail with 422)
    run_test(
        "Play Track With Invalid Data", 
        "/spotify/play", 
        method="POST",
        params={"access_token": "invalid_token"},
        data={},  # Missing required track_uri field
        expected_status=422  # Expecting validation error for missing required field
    )
    
    # 8. Test POST /api/spotify/play with valid structure but invalid token
    run_test(
        "Play Track With Valid Structure", 
        "/spotify/play", 
        method="POST",
        params={"access_token": "invalid_token"},
        data={"track_uri": "spotify:track:1234567890", "position_ms": 15000, "device_id": "device_id_1"},
        expected_status=400  # Expecting error due to invalid token, but structure is valid
    )
    
    # Print summary of all tests
    print_summary()

if __name__ == "__main__":
    main()