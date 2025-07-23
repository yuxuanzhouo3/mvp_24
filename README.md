# mornGPT-h1 🚀

**Multi-Prompt GPT Assistant for Enhanced AI Interactions**

[![GitHub](https://img.shields.io/badge/GitHub-yuxuanzhouo3%2Fmvp_24-blue?style=flat-square&logo=github)](https://github.com/yuxuanzhouo3/mvp_24)
[![License](https://img.shields.io/badge/License-MIT-green.svg?style=flat-square)](LICENSE)
[![Python](https://img.shields.io/badge/Python-3.8+-blue.svg?style=flat-square&logo=python)](https://www.python.org/)

## 📖 Overview

mornGPT-h1 is an advanced multi-prompt GPT assistant designed to handle complex AI interactions through intelligent prompt management and response optimization. The "h1" designation represents the first iteration of our multi-prompt architecture, enabling sophisticated conversation flows and context-aware responses.

## ✨ Features

- **Multi-Prompt Architecture**: Handle complex conversations with multiple prompt types
- **Context Management**: Intelligent context preservation across conversation turns
- **Response Optimization**: Enhanced response quality through prompt engineering
- **Modular Design**: Easy to extend and customize for different use cases
- **Real-time Processing**: Fast and efficient prompt handling
- **Error Handling**: Robust error management and recovery mechanisms

## 🏗️ Architecture

```
mornGPT-h1/
├── src/
│   ├── prompts/          # Prompt templates and configurations
│   ├── handlers/         # Prompt processing handlers
│   ├── utils/           # Utility functions and helpers
│   └── api/             # API endpoints and interfaces
├── tests/               # Test suites
├── docs/                # Documentation
├── examples/            # Usage examples
└── config/              # Configuration files
```

## 🚀 Quick Start

### Prerequisites

- Python 3.8 or higher
- OpenAI API key (or compatible GPT service)
- Git

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yuxuanzhouo3/mvp_24.git
   cd mvp_24
   ```

2. **Install dependencies**
   ```bash
   pip install -r requirements.txt
   ```

3. **Configure environment**
   ```bash
   cp .env.example .env
   # Edit .env with your API keys and configuration
   ```

4. **Run the application**
   ```bash
   python src/main.py
   ```

## 📚 Usage

### Basic Usage

```python
from mornGPT import MultiPromptGPT

# Initialize the assistant
gpt = MultiPromptGPT()

# Process a multi-prompt conversation
response = gpt.process_conversation([
    "What is the weather like?",
    "Based on that, what should I wear?",
    "Can you suggest activities for today?"
])
```

### Advanced Configuration

```python
# Custom prompt configuration
config = {
    "max_tokens": 1000,
    "temperature": 0.7,
    "prompt_strategy": "sequential",
    "context_window": 10
}

gpt = MultiPromptGPT(config=config)
```

## 🔧 Configuration

The application can be configured through environment variables or configuration files:

| Variable | Description | Default |
|----------|-------------|---------|
| `OPENAI_API_KEY` | OpenAI API key | Required |
| `MODEL_NAME` | GPT model to use | `gpt-3.5-turbo` |
| `MAX_TOKENS` | Maximum response tokens | `1000` |
| `TEMPERATURE` | Response creativity | `0.7` |

## 🧪 Testing

Run the test suite:

```bash
# Run all tests
python -m pytest tests/

# Run with coverage
python -m pytest tests/ --cov=src --cov-report=html
```

## 📝 API Documentation

### Endpoints

- `POST /api/chat` - Process multi-prompt conversations
- `GET /api/health` - Health check endpoint
- `POST /api/configure` - Update configuration

### Example API Usage

```bash
curl -X POST http://localhost:8000/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "prompts": [
      "Analyze this data: [data]",
      "Generate insights from the analysis",
      "Create actionable recommendations"
    ],
    "context": "business_analysis"
  }'
```

## 🤝 Contributing

We welcome contributions! Please follow these steps:

1. **Fork the repository**
2. **Create a feature branch**
   ```bash
   git checkout -b feature/amazing-feature
   ```
3. **Make your changes**
4. **Add tests for new functionality**
5. **Commit your changes**
   ```bash
   git commit -m "Add amazing feature"
   ```
6. **Push to the branch**
   ```bash
   git push origin feature/amazing-feature
   ```
7. **Open a Pull Request**

### Development Setup

```bash
# Install development dependencies
pip install -r requirements-dev.txt

# Set up pre-commit hooks
pre-commit install

# Run linting
flake8 src/
black src/
```

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- OpenAI for providing the GPT API
- The open-source community for inspiration and tools
- Contributors and users of mornGPT-h1

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/yuxuanzhouo3/mvp_24/issues)
- **Discussions**: [GitHub Discussions](https://github.com/yuxuanzhouo3/mvp_24/discussions)
- **Email**: [Your Email]

## 🔄 Version History

- **v1.0.0** - Initial release with multi-prompt architecture
- **v1.1.0** - Enhanced context management
- **v1.2.0** - API improvements and error handling

---

**Made with ❤️ by the mornGPT team**

*Empowering AI interactions through intelligent multi-prompt processing* 