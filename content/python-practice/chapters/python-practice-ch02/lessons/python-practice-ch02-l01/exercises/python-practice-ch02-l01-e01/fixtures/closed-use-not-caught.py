from io import StringIO

with StringIO("通常") as normal:
    print(normal.getvalue())
    print(normal.closed)
print(normal.closed)

try:
    with StringIO("例外") as broken:
        print(broken.getvalue())
        print(broken.closed)
        raise ValueError("中断")
except ValueError:
    print("例外を受け止めた")
print(broken.closed)

print(broken.getvalue())
