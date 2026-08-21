import json
import urllib.request

BASE = "http://localhost:5000"

members = [
    ("Boyer", "Jnboyer91@gmail.com"),
    ("Burns", "msburns003@gmail.com"),
    ("Dave", "Davidjvaynman@gmail.com"),
    ("Dewey", "odelldavidw@gmail.com"),
    ("Dill", "Dillonmyers02@gmail.com"),
    ("Dobbins", "will.dobbinsjr@gmail.com"),
    ("Eric", "Aluisee@gmail.com"),
    ("Haines WSTD", "Zachery.Haines@gmail.com"),
    ("Hutch", "Zach.hutch1993@gmail.com"),
    ("Jaraad", "Yates217@gmail.com"),
    ("Jeff", "soonerjah89@gmail.com"),
    ("JG", "John.gay0510@gmail.com"),
    ("Jordan", "Jordan.a.smith757@gmail.com"),
    ("Juke", "Lukas.s.makowski@gmail.com"),
    ("Kev", "kevinhumd11@gmail.com"),
    ("Koby", "Kobycav@gmail.com"),
    ("Kyle M", "ktmaner2@gmail.com"),
    ("WASTED", "kyhar317@terpmail.umd.edu"),
    ("Manning", "mmanning626@gmail.com"),
    ("Landis", "landislong23@gmail.com"),
    ("Mike", "Michaelburns26@gmail.com"),
    ("Little Mike", "Reedmike10@gmail.com"),
    ("McCarthy", "Mcarth630@gmail.com"),
    ("Pat", "pdryan17@gmail.com"),
    ("Preston", "prestonrfrey@gmail.com"),
    ("Rob", "rjmichels0@gmail.com"),
    ("Ryan M", "Ryanmmorgan89@gmail.com"),
    ("Ryan R", "Ryrubin19@gmail.com"),
    ("Sam", "Samglushakow@gmail.com"),
    ("Tim", "Golf110262@gmail.com"),
    ("TK", "tylerkelley28@gmail.com"),
    ("Todt", "ndfootball182@gmail.com"),
    ("Tommy WSTD", "Tommy.Burns0327@gmail.com"),
    ("WASTED", "victorwalker0212@gmail.com"),
    ("Wayne WSTD", "Wayne.craig32@gmail.com"),
    ("Will Benton", "will.benton6@gmail.com"),
    ("Crabs", "ohsocrabby12@gmail.com"),
    ("Conner", "Chsnodg2@gmail.com"),
    ("Will Lyons WSTD", "Wplyons13@gmail.com"),
    ("Mike Sr", "rachelkaythompson@gmail.com"),
]


def post(path, body, token=None):
    req = urllib.request.Request(
        BASE + path,
        data=json.dumps(body).encode(),
        method="POST",
        headers={"Content-Type": "application/json", **({"Authorization": f"Bearer {token}"} if token else {})},
    )
    try:
        with urllib.request.urlopen(req) as resp:
            return resp.status, json.loads(resp.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read())


status, data = post("/api/auth/login", {"email": "msburns003@gmail.com", "password": "gridiron2026"})
if status != 200:
    print("LOGIN FAILED", status, data)
    raise SystemExit(1)
token = data["token"]

results = []
for name, email in members:
    if email.lower().strip() == "msburns003@gmail.com":
        results.append((name, email, "skip: this is the admin account"))
        continue
    status, data = post("/api/admin/members", {"name": name, "email": email}, token=token)
    if status == 200:
        results.append((name, email, data["tempPassword"]))
    elif status == 409:
        results.append((name, email, "already exists"))
    else:
        results.append((name, email, f"ERROR {status}: {data}"))

print(f"{'Name':<18} {'Email':<32} {'Result'}")
for name, email, result in results:
    print(f"{name:<18} {email:<32} {result}")
