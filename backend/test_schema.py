#!/usr/bin/env python3
"""
测试 Pydantic Schema 是否正确处理 snake_case 和 camelCase
"""
import sys
sys.path.insert(0, '/Users/saiyeux/Repos/ScriptConverter/backend')

from app.schemas.common import GenerateCharacterLibraryRequest

print("=" * 60)
print("Testing Pydantic Schema Configuration")
print("=" * 60)

# 测试1: snake_case
print("\n1. Testing snake_case input (image_types):")
data1 = {"image_types": ["front", "side", "back"]}
print(f"   Input: {data1}")
try:
    req1 = GenerateCharacterLibraryRequest(**data1)
    print(f"   ✓ Success! Parsed value: {req1.image_types}")
    print(f"   Model dump: {req1.model_dump()}")
    print(f"   Model dump (by_alias): {req1.model_dump(by_alias=True)}")
except Exception as e:
    print(f"   ✗ Failed: {e}")

# 测试2: camelCase
print("\n2. Testing camelCase input (imageTypes):")
data2 = {"imageTypes": ["front", "side", "back"]}
print(f"   Input: {data2}")
try:
    req2 = GenerateCharacterLibraryRequest(**data2)
    print(f"   ✓ Success! Parsed value: {req2.image_types}")
    print(f"   Model dump: {req2.model_dump()}")
    print(f"   Model dump (by_alias): {req2.model_dump(by_alias=True)}")
except Exception as e:
    print(f"   ✗ Failed: {e}")

# 测试3: 空对象 (应该使用默认值 None)
print("\n3. Testing empty object (should use default None):")
data3 = {}
print(f"   Input: {data3}")
try:
    req3 = GenerateCharacterLibraryRequest(**data3)
    print(f"   ✓ Success! Parsed value: {req3.image_types}")
    print(f"   Model dump: {req3.model_dump()}")
    print(f"   Model dump (by_alias): {req3.model_dump(by_alias=True)}")
except Exception as e:
    print(f"   ✗ Failed: {e}")

# 测试4: 模拟 FastAPI 的 JSON 解析
print("\n4. Testing FastAPI-style JSON parsing:")
import json
json_str = '{"image_types": ["front", "side"]}'
print(f"   JSON string: {json_str}")
try:
    data = json.loads(json_str)
    req4 = GenerateCharacterLibraryRequest(**data)
    print(f"   ✓ Success! Parsed value: {req4.image_types}")
except Exception as e:
    print(f"   ✗ Failed: {e}")

print("\n" + "=" * 60)
print("Schema Configuration Summary:")
print("=" * 60)
print(f"Model config: {GenerateCharacterLibraryRequest.model_config}")
print("\nConclusion:")
print("If all tests pass, the schema is correctly configured.")
print("If camelCase fails, we need to ensure populate_by_name=True")
