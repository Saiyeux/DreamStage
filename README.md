# 🎬 Dream Stage: Your AI-Powered Director's Assistant

<div align="center">

**Turn Scripts into Visual Masterpieces with Consistency**

[Features](#-key-features) • [Showcase](#-showcase) • [Tech Stack](#-tech-stack) • [Getting Started](#-getting-started)

[**中文文档 (Chinese)**](./README_CN.md)

</div>

---

## 🚀 Overview

**Dream Stage** is not just another text-to-any tool. It is a comprehensive **AI Director's Assistant** designs for filmmakers, storyboard artists, and pre-visualization teams. 

We bridge the gap between textual screenplays and visual production. By analyzing scripts, extracting characters, and generating consistent scenes, we empower creators to visualize their stories before a single camera rolls.

Our core advantage is **Precise Workflow Management**, which results in **High Controllability** and **Consistency of Characters and Scenes**. We ensure that your artistic vision is executed with precision, frame by frame.

## ✨ Key Features

### 🎭 Character Consistency & "Finalize" Mode
Stop wrestling with random character generations.
- **Character Analysis**: Automatically extracts character descriptions, traits, and outfits from the script.
- **Lock & Load**: Once you generate a character you love, **"Finalize"** it. 
- **Stable Generation**: The system locks the character's identity (face, style, costume) so they look the same in Scene 1 and Scene 100.

### 🎬 Director's Workbench
Orchestrate your scenes like a pro.
- **Drag & Drop**: Simply drag your "Finalized" characters onto a stage.
- **Spatial Blocking**: Arrange characters and props visually to define the scene's composition.
- **Reference-Based Generation**: We use your layout as a rigid control condition (ControlNet/IPAdapter) to generate scenes that respect your direction.

### 🧠 Intelligent Script Analysis
- **Deep Understanding**: Powered by LLMs (Ollama/LMStudio) to understand context, subtext, and mood.
- **Streaming Analysis**: Watch the analysis happen in real-time, line by line, just like a typewriter.
- **Scene Breakdown**: Automatically segments scripts into Acts, Scenes, and Beats.

### 📱 Multi-Platform
- **Web & Mobile**: Manage your production on the big screen or review assets on the go.

## 📸 Showcase

> Experience the power of consistent character placement and scene generation.

### The Workspace
![Workspace Preview](archive/shots1.png)

### Consistency in Action
![Character Consistency](archive/shots2.png)

## 🛠️ Tech Stack

- **Frontend**: React, TypeScript, TailwindCSS, Zustand
- **Backend**: Python, FastAPI, Server-Sent Events (SSE)
- **AI Core**: 
    - **LLM**: Ollama / LMStudio (Script Logic)
    - **Vision**: ComfyUI (Image/Video Generation)

## 🗺️ Roadmap & Status

### 🛠️ Feature Development
- [x] Backend Service Architecture
- [x] Script Analysis (LLM)
- [x] Image Generation
- [ ] Keyframe Generation
- [ ] Video Generation

### ⚡ Generative Pipelines
- [x] Text Analysis Workflow
- [x] Image Generation Workflow
- [x] Image Composition Workflow
- [x] Video Synthesis Workflow

### 🎨 Interaction Design
- [x] PC Browser Interface
- [ ] Mobile Interface

## 🏁 Getting Started

1. **Clone the repo**
   ```bash
   git clone https://github.com/saiyeux/ScriptConverter.git
   ```
2. **Install Backend**
   ```bash
   cd backend && pip install -r requirements.txt
   ```
3. **Start Frontend**
   ```bash
   cd frontend && npm install && npm run dev
   ```

---
<div align="center">
Designed for Storytellers. Built with ❤️ by the Dream Stage Team.
</div>
