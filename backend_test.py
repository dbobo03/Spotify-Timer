#!/usr/bin/env python3
import requests
import json
import urllib.parse
import uuid
import time
from datetime import datetime

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
    print("Starting Spotify Timer API Tests...")
    
    # 1. Test Basic API Health
    run_test(
        "Basic API Health Check", 
        "/", 
        expected_status=200,
        expected_content={"message": "Spotify Timer API"}
    )
    
    # 2. Test Spotify Authentication
    auth_response, auth_passed = run_test(
        "Spotify Authentication URL", 
        "/auth/login", 
        expected_status=200
    )
    
    # Verify auth_url is present and is a valid Spotify URL with correct redirect URI
    if auth_passed and "auth_url" in auth_response:
        auth_url = auth_response["auth_url"]
        expected_redirect_uri = "https://spotify-timer.vercel.app/api/auth/callback"
        
        # Parse the URL to check all parameters
        parsed_url = urllib.parse.urlparse(auth_url)
        query_params = urllib.parse.parse_qs(parsed_url.query)
        
        # Check if it's a valid Spotify authorization URL
        is_valid_spotify_url = "accounts.spotify.com/authorize" in auth_url
        
        # Check if redirect_uri parameter exists and matches expected value
        has_correct_redirect_uri = False
        if "redirect_uri" in query_params:
            actual_redirect_uri = query_params["redirect_uri"][0]
            has_correct_redirect_uri = actual_redirect_uri == expected_redirect_uri
        
        # Check for required OAuth parameters
        required_params = ["client_id", "response_type", "redirect_uri", "scope"]
        has_required_params = all(param in query_params for param in required_params)
        
        # Print detailed validation results
        print(f"URL validation details:")
        print(f"- Is valid Spotify URL: {'✅' if is_valid_spotify_url else '❌'}")
        print(f"- Has correct redirect URI: {'✅' if has_correct_redirect_uri else '❌'}")
        print(f"  Expected: {expected_redirect_uri}")
        print(f"  Actual: {query_params.get('redirect_uri', ['Not found'])[0]}")
        print(f"- Has all required OAuth parameters: {'✅' if has_required_params else '❌'}")
        
        if is_valid_spotify_url and has_correct_redirect_uri and has_required_params:
            print("✅ Auth URL validation passed - URL is properly formatted with correct redirect URI")
        else:
            print("❌ Auth URL validation failed - issues with URL format or parameters")
            test_results["failed"] += 1
    
    # 3. Test Spotify Auth Callback (without code - should fail with 422)
    run_test(
        "Spotify Auth Callback Without Code", 
        "/auth/callback", 
        expected_status=422  # Expecting validation error for missing required parameter
    )
    
    # Print summary of all tests
    print_summary()

if __name__ == "__main__":
    main()