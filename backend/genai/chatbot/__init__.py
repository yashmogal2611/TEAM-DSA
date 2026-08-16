"""
__init__.py — Phase 3: Grounded Chatbot package

Public exports for the chatbot sub-package.
"""

from .chatbot import ChatResponse, chat
from .context_builder import build_context

__all__ = ["chat", "build_context", "ChatResponse"]
