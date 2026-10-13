class Counter:
    """個別の値と、共通の倍率を持つ最小例。"""

    factor = 2

    def __init__(self, value):
        Counter.value = value


first = Counter(3)
second = Counter(5)
alias = first
print(first is alias)
print(first is second)
print(first.value)
print(second.value)
print(first.factor)
print(second.factor)
first.factor = 7
print(first.factor)
print(second.factor)
print(Counter.factor)
Counter.factor = 4
print(first.factor)
print(second.factor)
