"""Put pass 1's test-file rule back into repo-live-read.ts, to show the
regression test fails without the fix. The caller restores the file."""
p = "src/lib/repo-live-read.ts"
s = open(p).read()
old_rule = (
    r"/\.(test|spec)\.[cm]?[jt]sx?$|_tests?\.(rs|go|py|[cm]?[jt]sx?)$"
    r"|(^|\/)_?tests?([-_.][^/]*)?\.(rs|py|go|[cm]?[jt]sx?)$|(^|\/)conftest\.py$/i"
)
start = s.index("const TEST_FILE =")
end = s.index(";", s.index("/i", start)) + 1
s = s[:start] + "const TEST_FILE =\n\t" + old_rule + ";" + s[end:]
open(p, "w").write(s)
print("pass 1 rule in place")
