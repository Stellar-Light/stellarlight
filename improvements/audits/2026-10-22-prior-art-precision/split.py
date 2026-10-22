# The split, fixed before any result is read: every third idea by id is held out.
# Writes ideas.json (id, idea, slice) and labels.json (idea id, idea, buildId, grade,
# plus the rubric) from the draft label file; the draft's notes and reasons are dropped.
import json
import sys

src, ideas_out, labels_out = sys.argv[1:4]
d = json.load(open(src))
ideas, labels = [], []
for i in d["ideas"]:
    n = int(i["id"][1:])
    ideas.append({"id": i["id"], "idea": i["idea"], "slice": "holdout" if n % 3 == 0 else "working"})
    for g in i["graded"]:
        labels.append({"ideaId": i["id"], "idea": i["idea"], "buildId": g["buildId"], "grade": g["grade"]})
json.dump({"ideas": ideas}, open(ideas_out, "w"), indent=1)
json.dump(
    {
        "rubric": {
            "version": "v1",
            "status": "draft labels, owner review pending",
            "question": "A hacker describes this idea. Which past hackathon builds are prior art they must see?",
            "2": "SAME IDEA: the build's core product does what the idea describes, for the same user problem, with the same core mechanism.",
            "1": "RELATED: same domain or a real component of the idea, useful context but a different product.",
            "0": "NOT PRIOR ART: shares words only, or a different product.",
            "rules": [
                "Judge from the name and description only. Placement and isWinner never change a grade.",
                "When torn between 2 and 1, choose 1. When torn between 1 and 0, choose 0.",
                "If the description is empty or too vague to tell, grade from the name alone.",
                "A build that does the idea as one feature among many unrelated features is a 1, not a 2.",
            ],
        },
        "labels": labels,
    },
    open(labels_out, "w"),
    indent=1,
)
print(len(ideas), "ideas;", sum(1 for o in ideas if o["slice"] == "holdout"), "held out:",
      " ".join(o["id"] for o in ideas if o["slice"] == "holdout"))
print(len(labels), "graded builds")
