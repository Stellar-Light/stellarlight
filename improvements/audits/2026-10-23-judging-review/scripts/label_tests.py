"""Independent label helper for the held-out set: test files by the
conventions the finding states (re-implemented from that text, in Python,
not from the TypeScript), CI files, and every other path that mentions
test or spec, for an eye scan of what the conventions leave out."""
import os
import re
import sys

OUT = os.environ.get("DUMPS", "dumps")
CODE_EXT = (".rs", ".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".mts", ".cts",
            ".py", ".go", ".sol", ".move", ".java", ".kt", ".swift", ".dart",
            ".rb", ".php", ".cs", ".c", ".cc", ".cpp", ".h")
VENDORED = ("node_modules", "vendor", "target", "dist", "build", ".next", "out")


def is_test(p: str) -> bool:
    parts = p.split("/")
    if any(seg in VENDORED for seg in parts[:-1]):
        return False
    name = parts[-1]
    low = name.lower()
    if not low.endswith(CODE_EXT):
        return False
    if any(seg.lower() in ("tests", "test", "__tests__", "spec", "e2e", "cypress") for seg in parts[:-1]):
        return True
    stem, _, ext = low.rpartition(".")
    if ext in ("js", "jsx", "ts", "tsx", "mjs", "cjs", "mts", "cts") and (
        ".test" in "." + stem.split(".", 1)[-1] or ".spec" in "." + stem.split(".", 1)[-1]
    ):
        # foo.test.ts / foo.spec.ts: the part before the extension ends in .test or .spec
        if stem.endswith(".test") or stem.endswith(".spec"):
            return True
    if ext == "rs" and (low in ("test.rs", "tests.rs") or low.startswith("test_")
                        or stem.endswith("_test") or stem.endswith("_tests")):
        return True
    if ext == "go" and stem.endswith("_test"):
        return True
    if ext == "py" and (low.startswith("test_") or stem.endswith("_test") or low == "conftest.py"):
        return True
    return False


CI = re.compile(r"^\.github/workflows/[^/]+\.ya?ml$|^\.circleci/config\.ya?ml$|^\.gitlab-ci\.ya?ml$"
                r"|^\.travis\.ya?ml$|^azure-pipelines\.ya?ml$|^Jenkinsfile$|^bitbucket-pipelines\.ya?ml$", re.I)

for d in sys.argv[1:]:
    paths = open(os.path.join(OUT, d, "tree.txt")).read().splitlines()[1:]
    tests = [p for p in paths if is_test(p)]
    ci = [p for p in paths if CI.search(p)]
    other = [p for p in paths if re.search(r"test|spec", p, re.I) and p not in tests]
    print("==", d, "| tests by convention:", len(tests), "| ci:", len(ci))
    print("   ci:", ci)
    print("   first tests:", tests[:3])
    print("   other paths naming test/spec (eye scan):")
    for p in other:
        print("     ", p)
