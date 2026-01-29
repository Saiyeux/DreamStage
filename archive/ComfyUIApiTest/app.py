import json
import uuid
import requests
import time

POSITIVE_PROMPT = "anime style, portrait of an 18-year-old fierce and intelligent girl, long dark hair, piercing aurora-blue eyes, determined yet vulnerable expression, lips slightly parted, skin with faint silver glow, holding a silver chalice. Front-facing, centered, from chest up, studio lighting, plain white background, sharp focus, highly detailed face, 8k, transparent background"
NEGATIVE_PROMPT = "You are an assistant designed to generate low-quality images based on textual prompts <Prompt Start> blurry, worst quality, low quality, jpeg artifacts, signature, watermark, username, error, deformed hands, bad anatomy, extra limbs, poorly drawn hands, poorly drawn face, mutation, deformed, extra eyes, extra arms, extra legs, malformed limbs, fused fingers, too many fingers, long neck, cross-eyed, bad proportions, missing arms, missing legs, extra digit, fewer digits, cropped"
COMFYUI_URL = "http://localhost:8000"

SEED = 131072
STEPS = 10
WIDTH = 1024
HEIGHT = 1024

# GUIDANCE = 
CFG = 4
CHECKPOINT_NAME = "NetaYumev35_pretrained_all_in_one.safetensors"


def create_workflow():
    workflow = {
  "3": {
    "inputs": {
      "width": WIDTH,
      "height": HEIGHT,
      "batch_size": 1
    },
    "class_type": "EmptySD3LatentImage",
    "_meta": {
      "title": "空Latent图像（SD3）"
    }
  },
  "4": {
    "inputs": {
      "shift": 4,
      "model": [
        "5",
        0
      ]
    },
    "class_type": "ModelSamplingAuraFlow",
    "_meta": {
      "title": "采样算法（AuraFlow）"
    }
  },
  "5": {
    "inputs": {
      "ckpt_name": CHECKPOINT_NAME
    },
    "class_type": "CheckpointLoaderSimple",
    "_meta": {
      "title": "Checkpoint加载器（简易）"
    }
  },
  "10": {
    "inputs": {
      "text": POSITIVE_PROMPT,
      "clip": [
        "5",
        1
      ]
    },
    "class_type": "CLIPTextEncode",
    "_meta": {
      "title": "CLIP文本编码"
    }
  },
  "11": {
    "inputs": {
      "text": NEGATIVE_PROMPT,
      "clip": [
        "5",
        1
      ]
    },
    "class_type": "CLIPTextEncode",
    "_meta": {
      "title": "CLIP文本编码"
    }
  },
  "12": {
    "inputs": {
      "seed": SEED,
      "steps": STEPS,
      "cfg": CFG,
      "sampler_name": "res_multistep",
      "scheduler": "linear_quadratic",
      "denoise": 1,
      "model": [
        "4",
        0
      ],
      "positive": [
        "10",
        0
      ],
      "negative": [
        "11",
        0
      ],
      "latent_image": [
        "3",
        0
      ]
    },
    "class_type": "KSampler",
    "_meta": {
      "title": "K采样器"
    }
  },
  "14": {
    "inputs": {
      "samples": [
        "12",
        0
      ],
      "vae": [
        "5",
        2
      ]
    },
    "class_type": "VAEDecode",
    "_meta": {
      "title": "VAE解码"
    }
  },
  "15": {
    "inputs": {
      "filename_prefix": "Anime",
      "images": [
        "14",
        0
      ]
    },
    "class_type": "SaveImage",
    "_meta": {
      "title": "保存图像"
    }
  }
}
    return workflow

def generate_client_id():
    return str(uuid.uuid4())

def submit_workflow():
    workflow = create_workflow()
    client_id = generate_client_id()

    payload = {
        "prompt" : workflow,
        "client_id" : client_id
    }

    print(f"Sending request to {COMFYUI_URL}/prompt")

    response = requests.post(f"{COMFYUI_URL}/prompt", json=payload)

    if response.status_code != 200:
        print(f"Error: {response.status_code}")
        return None 
    
    response_data = response.json()
    prompt_id = response_data.get("prompt_id")
    print(f"Queued prompt: ", prompt_id)
    return prompt_id

def wait_for_completion(prompt_id):
    print("Waiting for generation complete...")

    while True:
        time.sleep(2)
        status_response = requests.get(f"{COMFYUI_URL}/history/{prompt_id}")

        if status_response.status_code != 200:
            print(f"\nError checking status: {status_response.status_code}")
            continue

        try:
            status_data = status_response.json()
        except json.JSONDecodeError:
            print("No json returned", end="\r", flush=True)
            continue

        if prompt_id in status_data:
            execution_data = status_data[prompt_id]
            if "status" in execution_data and execution_data["status"].get("completed", False):
                print("\Generation completed!")
                return status_data
            if "status" in execution_data and "error" in execution_data["status"]:
                print(f"Error while executing: ", execution_data["status"]["error"])
                return None
        print("Generating image...", end="\r", flush=True)

def download_image(status_data, prompt_id):
    if prompt_id not in status_data or "outputs" not in status_data[prompt_id]:
        print("No outputs found in status data")
        return
    
    outputs = status_data[prompt_id]["outputs"]
    images_download = 0
    for node_id, node_output in outputs.items():
        if "images" in node_output:
            for image_info in node_output["images"]:
                filename = image_info["filename"]
                subfolder = image_info.get("subfolder", "")

                view_params = {
                    "filename" : filename,
                    "type" : "output"
                }

                if subfolder:
                    view_params["subfolder"] = subfolder

                print(f"Downloading: {filename}")
                image_response = requests.get(f"{COMFYUI_URL}/view", params=view_params)

                if image_response.status_code == 200:
                    output_filename = f"output_{filename}"
                    with open(output_filename, "wb") as image_file:
                        image_file.write(image_response.content)
                    print(f"Image saved as {output_filename}")
                    images_download += 1
                else:
                    print(f"Error downloading image: {image_response.status_code}")
    
    if images_download == 0:
        print("No images were downloaded")
    else:
        print(f"Successfully downloaded {images_download} image(s)")

def main():
    print("=" * 50)
    print("ComfyUI Image Generation")
    print("=" * 50)

    prompt_id = submit_workflow()
    if not prompt_id:
        print("Failed to generate image")
        return
    
    status_data = wait_for_completion(prompt_id=prompt_id)

    if not status_data:
        print("Image generation failed or cancelled")
        return
    
    download_image(status_data, prompt_id)

if __name__ == "__main__":
    main()