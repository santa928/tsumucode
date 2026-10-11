counts = {"red": 3, "blue": 5}
counts["red"] = 4
total = 0
for key in counts:
    total = counts[key] + total
print(counts["red"])
print(total)
