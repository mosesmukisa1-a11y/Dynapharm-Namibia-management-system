"""Offline negative controls; generated dummy values, never real credentials."""
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("audit", Path(__file__).with_name("audit-credential-exposure.py"))
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)

class ClassificationTests(unittest.TestCase):
    def test_test_filename_cannot_allowlist_literal(self):
        for path in ["tests/helpers/price-ui-fixtures.mjs", "scripts/seed-sale-evidence-ui.mjs",
                     "tests/safe-stock-smoke.unit.test.js", "setup-local-database.sh"]:
            data = ("password = '" + "GENERATED_NEGATIVE_CONTROL" + "'").encode()
            rows = audit.findings(data)
            self.assertTrue(rows)
            for row in rows:
                self.assertIsNone(audit.classify(path, row, data))

    def test_adjacent_ui_or_synthetic_marker_cannot_allowlist(self):
        for context in ["alert('test');", "showToast('test');", "// error: test",
                        "// localhost YOUR_test placeholder= toThrow("]:
            data = ("password = '" + "GENERATED_NEGATIVE_CONTROL" + "'; " + context).encode()
            for row in audit.findings(data):
                self.assertIsNone(audit.classify("tests/example.test.js", row, data))

    def test_reserved_host_is_not_credential_provenance(self):
        for host in ["localhost", "127.0.0.1", "example.invalid"]:
            data = ("postgres://" + "synthetic:GENERATED_NEGATIVE_CONTROL@" + host + "/test").encode()
            rows = audit.findings(data)
            self.assertTrue(rows)
            for row in rows:
                self.assertIsNone(audit.classify("tests/example.test.js", row, data))

    def test_results_never_include_literal(self):
        value = "GENERATED_NEGATIVE_CONTROL"
        data = ("password = '" + value + "'").encode()
        self.assertNotIn(value, str(audit.findings(data)))

if __name__ == "__main__":
    unittest.main()
