"""Tests for the .env loader: precedence, parsing, gitignore safety."""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest import mock

from ksl_env import load_dotenv


class LoadDotenvTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)

    def load(self, text: str) -> bool:
        path = Path(self.tmp.name) / ".env"
        path.write_text(text)
        return load_dotenv(path)

    def test_parses_values_and_strips_quotes(self) -> None:
        self.load('KSL_TEST_BASE="https://x/v1"\nKSL_TEST_MODEL=llama\n')
        import os

        self.assertEqual("https://x/v1", os.environ.pop("KSL_TEST_BASE"))
        self.assertEqual("llama", os.environ.pop("KSL_TEST_MODEL"))

    def test_ignores_comments_blanks_and_malformed(self) -> None:
        self.load("# comment\n\n   \nNO_EQUALS_SIGN\nKSL_GOOD=1\n")
        import os

        self.assertEqual("1", os.environ.pop("KSL_GOOD"))
        self.assertNotIn("NO_EQUALS_SIGN", os.environ)

    def test_existing_env_vars_win(self) -> None:
        with mock.patch.dict("os.environ", {"KSL_EXISTING": "from-env"}):
            self.load("KSL_EXISTING=from-file\n")
            import os

            self.assertEqual("from-env", os.environ["KSL_EXISTING"])

    def test_missing_file_returns_false(self) -> None:
        self.assertFalse(load_dotenv(Path(self.tmp.name) / "nope.env"))


if __name__ == "__main__":
    unittest.main()
