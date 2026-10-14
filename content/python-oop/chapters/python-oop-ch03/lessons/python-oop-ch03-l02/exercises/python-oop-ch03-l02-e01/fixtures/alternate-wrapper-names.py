from functools import wraps


def calls_calls(target):
    calls = 0

    @wraps(target)
    def forward(*values, **kwvalues):
        nonlocal calls
        calls += 1
        print("呼出", calls)
        return target(*values, **kwvalues)

    return forward


def add(value, extra=0):
    """値と加算分を足す。"""
    if value < 0:
        raise ValueError("負の値")
    return value + extra

original = add
decorated = calls_calls(add)

@calls_calls
def double(value, extra=0):
    """値を2倍して加算する。"""
    if value < 0:
        raise ValueError("負の値")
    return value * 2 + extra

print(decorated is original)
print(decorated.__name__ == original.__name__)
print(decorated.__doc__ == original.__doc__)
print(decorated.__wrapped__ is original)
print(decorated(3, extra=2))
print(decorated(4, 1))
print(double(3, extra=1))
try:
    decorated(-1, extra=2)
except ValueError as error:
    print(str(error))
print(decorated(2))
print(double(4))
