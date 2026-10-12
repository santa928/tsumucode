from io import StringIO

with StringIO("通常") as normal:
    print(normal.getvalue())
    print(normal.closed)
print(normal.closed)

try:
    broken = StringIO("例外")
    print(broken.getvalue())
    print(broken.closed)
    raise ValueError("中断")
    broken.close()
except ValueError:
    print("例外を受け止めた")
print(broken.closed)

try:
    print(broken.getvalue())
except ValueError:
    print("終了後は利用できない")
