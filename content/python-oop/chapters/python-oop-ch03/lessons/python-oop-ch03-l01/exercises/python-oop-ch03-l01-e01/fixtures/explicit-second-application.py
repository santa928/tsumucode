def count_calls(function):
    count = 0

    def wrapper(*args, **kwargs):
        nonlocal count
        count += 1
        print("呼出", count)
        return function(*args, **kwargs)

    return wrapper


def add(value, extra=0):
    """値と加算分を足す。"""
    if value < 0:
        raise ValueError("負の値")
    return value + extra

original = add
decorated = count_calls(add)

def double(value, extra=0):
    """値を2倍して加算する。"""
    if value < 0:
        raise ValueError("負の値")
    return value * 2 + extra

double = count_calls(double)

print(decorated is original)
print(decorated(3, extra=2))
print(decorated(4, 1))
print(double(3, extra=1))
try:
    decorated(-1, extra=2)
except ValueError as error:
    print(str(error))
print(decorated(2))
print(double(4))
