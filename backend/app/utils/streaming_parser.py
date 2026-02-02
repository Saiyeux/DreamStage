import json
import re
from typing import Generator, Any, Optional

class StreamingJSONParser:
    """
    Parses a stream of text to extract JSON objects incrementally.
    Designed to handle LLM output which might be wrapped in markdown code blocks
    or contain a list of objects.
    """
    def __init__(self):
        self.buffer = ""
        self.start_idx = -1
    
    def feed(self, chunk: str) -> Generator[Any, None, None]:
        """
        Feed a chunk of text and yield any complete JSON objects found.
        """
        self.buffer += chunk
        
        while True:
            # If we haven't found a start yet, look for one
            if self.start_idx == -1:
                self.start_idx = self.buffer.find('{')
                if self.start_idx == -1:
                    return
            
            # Scan from start_idx with FRESH state
            balance = 0
            in_string = False
            escape = False
            
            # We scan from start_idx to the end of the buffer
            # We must detect if we successfully found a complete object
            found_object = False
            i = self.start_idx
            
            while i < len(self.buffer):
                char = self.buffer[i]
                
                if escape:
                    escape = False
                elif char == '\\':
                    escape = True
                elif char == '"':
                    in_string = not in_string
                elif not in_string:
                    if char == '{':
                        balance += 1
                    elif char == '}':
                        balance -= 1
                        if balance == 0:
                            # Found a potential end of object
                            candidate = self.buffer[self.start_idx : i+1]
                            try:
                                # Try to parse
                                obj = json.loads(candidate)
                                yield obj
                                
                                # Success! Remove processed part from buffer
                                self.buffer = self.buffer[i+1:]
                                self.start_idx = -1
                                found_object = True
                                break # Break inner loop, continue outer loop
                            except json.JSONDecodeError:
                                # False alarm, continue scanning
                                pass
                
                i += 1
            
            if not found_object:
                # We reached end of buffer without completing an object
                return
