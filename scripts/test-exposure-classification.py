"""Offline negative controls; generated dummy values, never real credentials."""
import importlib.util
from pathlib import Path
import unittest
import subprocess

spec = importlib.util.spec_from_file_location("audit", Path(__file__).with_name("audit-credential-exposure.py"))
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)

class ClassificationTests(unittest.TestCase):
    def test_exact_ui_expression_is_not_assignment_but_adjacent_assignment_is_detected(self):
        text = 'alert("Unable to change ' + 'password' + ': " + (result.error || "Unknown error"));'
        rows = audit.findings(text.encode())
        self.assertTrue(rows)
        self.assertTrue(all(audit.classify("arbitrary.js", r, text.encode()) == "FALSE_POSITIVE" for r in rows))
        real_shaped = "pass" + "word" + " = " + chr(39) + "NEGATIVE_CONTROL_123456" + chr(39) + "; "
        combined = (real_shaped + text).encode()
        self.assertTrue(all(audit.classify("arbitrary.js", r, combined) is None for r in audit.findings(combined)))

    def test_runtime_fixture_is_still_detected_if_hardcoded(self):
        # Values stay in memory; source and output contain no retained credential.
        result = subprocess.run(["node", "--input-type=module", "-e",
            "import {syntheticCredentialUrl} from './scripts/lib/synthetic-credential-fixture.mjs'; process.stdout.write(syntheticCredentialUrl());"],
            env={"PATH": audit.os.environ.get("PATH", ""), "NODE_ENV": "test"},
            capture_output=True, check=True)
        rows = audit.findings(result.stdout)
        self.assertTrue(any(row["category"] == "credential_uri" for row in rows))
        for row in rows:
            self.assertIsNone(audit.classify("tests/example.test.js", row, result.stdout))

    def test_test_filename_cannot_allowlist_literal(self):
        for path in ["tests/helpers/price-ui-fixtures.mjs", "scripts/seed-sale-evidence-ui.mjs",
                     "tests/safe-stock-smoke.unit.test.js", "setup-local-database.sh"]:
            data = ("pass" + "word" + " = " + chr(39) + "GENERATED_NEGATIVE_CONTROL" + chr(39)).encode()
            rows = audit.findings(data)
            self.assertTrue(rows)
            for row in rows:
                self.assertIsNone(audit.classify(path, row, data))

    def test_adjacent_ui_or_synthetic_marker_cannot_allowlist(self):
        for context in ["alert('test');", "showToast('test');", "// error: test",
                        "// localhost YOUR_test placeholder= toThrow("]:
            data = ("pass" + "word" + " = " + chr(39) + "GENERATED_NEGATIVE_CONTROL" + chr(39) + "; " + context).encode()
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
        data = ("pass" + "word" + " = " + chr(39) + value + chr(39)).encode()
        self.assertNotIn(value, str(audit.findings(data)))

if __name__ == "__main__":
    unittest.main()
