#!/usr/bin/env python3
"""
测试 ComfyUI 生成 API 端点
"""
import requests
import json
import sys

BASE_URL = "http://localhost:8001/api"

def test_character_library_generation():
    """测试角色库生成端点"""
    print("=" * 60)
    print("Testing Character Library Generation API")
    print("=" * 60)
    
    # 首先获取项目列表
    print("\n1. Fetching projects...")
    try:
        response = requests.get(f"{BASE_URL}/projects")
        response.raise_for_status()
        projects = response.json()
        
        if not projects:
            print("❌ No projects found. Please create a project first.")
            return False
            
        project_id = projects[0]["id"]
        print(f"✓ Found project: {projects[0]['name']} (ID: {project_id})")
    except Exception as e:
        print(f"❌ Failed to fetch projects: {e}")
        return False
    
    # 测试生成请求
    print("\n2. Testing character library generation...")
    
    # 测试1: 使用 snake_case
    print("\n   Test 1: Using snake_case (image_types)")
    payload1 = {"image_types": ["front", "side", "back"]}
    print(f"   Payload: {json.dumps(payload1)}")
    
    try:
        response = requests.post(
            f"{BASE_URL}/projects/{project_id}/generate/character-library",
            json=payload1,
            headers={"Content-Type": "application/json"}
        )
        print(f"   Status Code: {response.status_code}")
        print(f"   Response: {response.text}")
        
        if response.status_code == 200:
            print("   ✓ snake_case works!")
        else:
            print(f"   ✗ Failed with status {response.status_code}")
            
    except Exception as e:
        print(f"   ✗ Request failed: {e}")
    
    # 测试2: 使用 camelCase
    print("\n   Test 2: Using camelCase (imageTypes)")
    payload2 = {"imageTypes": ["front", "side", "back"]}
    print(f"   Payload: {json.dumps(payload2)}")
    
    try:
        response = requests.post(
            f"{BASE_URL}/projects/{project_id}/generate/character-library",
            json=payload2,
            headers={"Content-Type": "application/json"}
        )
        print(f"   Status Code: {response.status_code}")
        print(f"   Response: {response.text}")
        
        if response.status_code == 200:
            print("   ✓ camelCase works!")
        else:
            print(f"   ✗ Failed with status {response.status_code}")
            
    except Exception as e:
        print(f"   ✗ Request failed: {e}")
    
    # 测试3: 不传 image_types (应该使用默认值)
    print("\n   Test 3: Without image_types (should use defaults)")
    payload3 = {}
    print(f"   Payload: {json.dumps(payload3)}")
    
    try:
        response = requests.post(
            f"{BASE_URL}/projects/{project_id}/generate/character-library",
            json=payload3,
            headers={"Content-Type": "application/json"}
        )
        print(f"   Status Code: {response.status_code}")
        print(f"   Response: {response.text}")
        
        if response.status_code == 200:
            print("   ✓ Default values work!")
        else:
            print(f"   ✗ Failed with status {response.status_code}")
            
    except Exception as e:
        print(f"   ✗ Request failed: {e}")
    
    print("\n" + "=" * 60)
    return True

if __name__ == "__main__":
    print("ComfyUI Generation API Test")
    print("Make sure the backend server is running on port 8001\n")
    
    try:
        # 检查服务器是否运行
        response = requests.get(f"{BASE_URL}/health", timeout=2)
        print(f"✓ Backend server is running (status: {response.status_code})\n")
    except Exception as e:
        print(f"❌ Backend server is not running: {e}")
        print("Please start the backend server first:")
        print("  cd backend && python -m uvicorn app.main:app --reload --port 8001")
        sys.exit(1)
    
    test_character_library_generation()
