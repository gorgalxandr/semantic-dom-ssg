"""Allow ``python -m semantic_dom_ssg``."""

import sys

from .cli import main

if __name__ == "__main__":
    sys.exit(main())
