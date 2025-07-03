#!/usr/bin/env python3
import requests
import json
import urllib.parse
import time

# Get the backend URL from the frontend .env file
BACKEND_URL = "https://be99c99a-b61c-4290-81c3-40fbf57bcd47.preview.emergentagent.com/api"

def test_spotify_auth():
    """Test the Spotify authentication system in detail"""
    print("\n" + "="*80)
    print("SPOTIFY AUTHENTICATION SYSTEM DIAGNOSTIC")
    print("="*80)
    
    # 1. Test the login endpoint
    print("\n1. Testing /api/auth/login endpoint...")
    login_url = f"{BACKEND_URL}/auth/login"
    
    try:
        response = requests.get(login_url, timeout=10)
        status_code = response.status_code
        
        try:
            response_json = response.json()
            print(f"Response ({status_code}): {json.dumps(response_json, indent=2)}")
        except:
            print(f"Response ({status_code}): {response.text}")
            response_json = {}
        
        if status_code == 200 and "auth_url" in response_json:
            print("✅ Login endpoint returned 200 status code with auth_url")
            auth_url = response_json["auth_url"]
            
            # 2. Verify the redirect URI
            print("\n2. Verifying redirect URI...")
            expected_redirect_uri = "https://be99c99a-b61c-4290-81c3-40fbf57bcd47.preview.emergentagent.com/auth/callback"
            
            # Parse the URL to check all parameters
            parsed_url = urllib.parse.urlparse(auth_url)
            query_params = urllib.parse.parse_qs(parsed_url.query)
            
            # Print all parameters for inspection
            print("\nAuth URL parameters:")
            for param, value in query_params.items():
                print(f"- {param}: {value[0]}")
            
            # Check if redirect_uri parameter exists and matches expected value
            has_correct_redirect_uri = False
            if "redirect_uri" in query_params:
                actual_redirect_uri = query_params["redirect_uri"][0]
                has_correct_redirect_uri = actual_redirect_uri == expected_redirect_uri
                
                print(f"\nRedirect URI validation:")
                print(f"- Expected: {expected_redirect_uri}")
                print(f"- Actual: {actual_redirect_uri}")
                print(f"- Match: {'✅' if has_correct_redirect_uri else '❌'}")
            else:
                print("❌ No redirect_uri found in auth URL")
            
            # 3. Check all required OAuth parameters
            print("\n3. Checking OAuth parameters...")
            required_params = {
                "client_id": "Spotify application client ID",
                "response_type": "Should be 'code' for authorization code flow",
                "redirect_uri": "Where Spotify will redirect after auth",
                "scope": "Permissions requested from Spotify"
            }
            
            missing_params = []
            for param in required_params:
                if param not in query_params:
                    missing_params.append(param)
            
            if missing_params:
                print(f"❌ Missing required parameters: {', '.join(missing_params)}")
            else:
                print("✅ All required OAuth parameters are present")
                
                # Validate specific parameter values
                if query_params["response_type"][0] != "code":
                    print(f"❌ response_type should be 'code', got '{query_params['response_type'][0]}'")
                else:
                    print(f"✅ response_type is correctly set to 'code'")
                
                # Check if scope contains necessary permissions
                necessary_scopes = [
                    "user-read-playback-state", 
                    "user-modify-playback-state",
                    "streaming"
                ]
                
                scopes = query_params["scope"][0].split()
                missing_scopes = [scope for scope in necessary_scopes if scope not in scopes]
                
                if missing_scopes:
                    print(f"❌ Missing necessary scopes: {', '.join(missing_scopes)}")
                else:
                    print(f"✅ All necessary scopes are included")
                    print(f"- Scopes: {', '.join(scopes)}")
            
            # 4. Test the callback endpoint with a test code
            print("\n4. Testing /api/auth/callback endpoint...")
            callback_url = f"{BACKEND_URL}/auth/callback"
            test_code = "test_auth_code"  # This is a fake code for testing
            
            try:
                callback_response = requests.get(f"{callback_url}?code={test_code}", timeout=10)
                callback_status = callback_response.status_code
                
                try:
                    callback_json = callback_response.json()
                    print(f"Callback Response ({callback_status}): {json.dumps(callback_json, indent=2)}")
                    
                    if callback_status == 200:
                        if "access_token" in callback_json:
                            print("✅ Callback endpoint returned an access token")
                            print("⚠️ NOTE: The callback endpoint accepted an invalid code, which is unusual")
                            print("   This might be due to a test/mock configuration in the backend")
                        else:
                            print("❌ Callback endpoint response is missing access_token")
                    else:
                        print(f"❌ Callback endpoint returned error status {callback_status}")
                except:
                    print(f"Callback Response ({callback_status}): {callback_response.text}")
            except Exception as e:
                print(f"❌ Error testing callback endpoint: {str(e)}")
            
            # 5. Test basic API connectivity
            print("\n5. Testing basic API connectivity...")
            root_url = f"{BACKEND_URL}/"
            root_response = requests.get(root_url, timeout=10)
            
            if root_response.status_code == 200:
                print(f"✅ API root endpoint is accessible (status {root_response.status_code})")
            else:
                print(f"❌ API root endpoint returned status {root_response.status_code}")
            
            # 6. Summary
            print("\n" + "="*80)
            print("AUTHENTICATION DIAGNOSTIC SUMMARY")
            print("="*80)
            
            if has_correct_redirect_uri and not missing_params and root_response.status_code == 200:
                print("✅ Spotify authentication system appears to be working correctly")
                print("- Auth URL is properly generated")
                print("- Redirect URI is correctly set")
                print("- All required OAuth parameters are present")
                print("- API connectivity is good")
                if callback_status == 200 and "access_token" in callback_json:
                    print("- Callback endpoint is accepting codes and returning tokens")
                    print("  NOTE: The callback endpoint is accepting invalid codes, which is unusual")
                    print("        This might be due to a test/mock configuration in the backend")
            else:
                print("❌ Issues detected with Spotify authentication system:")
                if not has_correct_redirect_uri:
                    print("- Redirect URI is incorrect")
                if missing_params:
                    print("- Missing required OAuth parameters")
                if root_response.status_code != 200:
                    print("- API connectivity issues")
        else:
            print(f"❌ Login endpoint failed with status {status_code} or missing auth_url")
    
    except Exception as e:
        print(f"❌ Error testing authentication: {str(e)}")

if __name__ == "__main__":
    test_spotify_auth()