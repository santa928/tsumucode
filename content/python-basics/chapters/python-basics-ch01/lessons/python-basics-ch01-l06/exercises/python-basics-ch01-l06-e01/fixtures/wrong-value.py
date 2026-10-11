stock = {"red": 3, "blue": 5}
stock["red"] = 4
total = 0
for key in stock:
    total = total + stock["red"]
print(stock["red"])
print(total)
