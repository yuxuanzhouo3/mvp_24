#!/usr/bin/env python3
"""
mornGPT-h1 Main Application Entry Point
Multi-Prompt GPT Assistant for Enhanced AI Interactions
"""

import os
import sys
from pathlib import Path

# Add src to path for imports
sys.path.append(str(Path(__file__).parent))

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Load environment variables
load_dotenv()

# Create FastAPI app
app = FastAPI(
    title="mornGPT-h1",
    description="Multi-Prompt GPT Assistant for Enhanced AI Interactions",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "message": "Welcome to mornGPT-h1",
        "version": "1.0.0",
        "description": "Multi-Prompt GPT Assistant"
    }

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "service": "mornGPT-h1"}

if __name__ == "__main__":
    import uvicorn
    
    # Get port from environment or use default
    port = int(os.getenv("PORT", 8000))
    
    print(f"🚀 Starting mornGPT-h1 on port {port}")
    print(f"📖 API Documentation: http://localhost:{port}/docs")
    
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=port,
        reload=True
    ) 