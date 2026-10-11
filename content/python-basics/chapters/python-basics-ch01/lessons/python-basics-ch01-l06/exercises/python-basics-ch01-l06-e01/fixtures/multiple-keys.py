stock = {"red": 3, "blue": 2, "green": 3}
stock["red"] = 4
total = 0
for key in stock:
    total = total + stock[key]
print(stock["red"])
print(total)
