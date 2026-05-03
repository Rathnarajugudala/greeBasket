from flask import Flask, render_template, request, jsonify, session, redirect, url_for
from pymongo import MongoClient
from werkzeug.security import generate_password_hash, check_password_hash
from bson import ObjectId
from bson.errors import InvalidId
from datetime import datetime
import os
import json

app = Flask(__name__)
app.secret_key = os.environ.get("SECRET_KEY", "fallback-secret")

# MongoDB Atlas URI from environment
MONGO_URI = os.environ.get("MONGO_URI")

client = MongoClient(MONGO_URI)
db = client["greenbasket"]

users_col    = db["users"]
products_col = db["products"]
orders_col   = db["orders"]
cart_col     = db["carts"]

# ─── Helper: serialize MongoDB docs ──────────────────────────────────────────
def serialize(doc):
    if doc is None:
        return None
    doc["_id"] = str(doc["_id"])
    return doc

def serialize_list(docs):
    return [serialize(d) for d in docs]

# ─── Seed initial products (runs once if collection is empty) ─────────────────
def seed_products():
    if products_col.count_documents({}) == 0:
        initial = [
            {"name":"Spinach",        "emoji":"🥬", "price":35,  "unit":"per bunch", "category":"Leafy Greens",    "stock":80,  "badge":"organic"},
            {"name":"Broccoli",       "emoji":"🥦", "price":75,  "unit":"per kg",    "category":"Leafy Greens",    "stock":45,  "badge":"fresh"},
            {"name":"Tomatoes",       "emoji":"🍅", "price":40,  "unit":"per kg",    "category":"Fruiting",        "stock":120, "badge":"organic"},
            {"name":"Carrots",        "emoji":"🥕", "price":50,  "unit":"per kg",    "category":"Root Vegetables", "stock":60,  "badge":""},
            {"name":"Cucumber",       "emoji":"🥒", "price":30,  "unit":"per kg",    "category":"Fruiting",        "stock":90,  "badge":"fresh"},
            {"name":"Beetroot",       "emoji":"🍠", "price":55,  "unit":"per kg",    "category":"Root Vegetables", "stock":40,  "badge":""},
            {"name":"Coriander",      "emoji":"🌿", "price":20,  "unit":"per bunch", "category":"Herbs",           "stock":150, "badge":"organic"},
            {"name":"Capsicum",       "emoji":"🫑", "price":80,  "unit":"per kg",    "category":"Fruiting",        "stock":35,  "badge":"fresh"},
            {"name":"Onion",          "emoji":"🧅", "price":30,  "unit":"per kg",    "category":"Root Vegetables", "stock":200, "badge":""},
            {"name":"Potato",         "emoji":"🥔", "price":25,  "unit":"per kg",    "category":"Root Vegetables", "stock":250, "badge":""},
            {"name":"Baby Corn",      "emoji":"🌽", "price":90,  "unit":"per 500g",  "category":"Exotic",          "stock":20,  "badge":"fresh"},
            {"name":"Purple Cabbage", "emoji":"🫐", "price":65,  "unit":"per kg",    "category":"Leafy Greens",    "stock":15,  "badge":"exotic"},
        ]
        products_col.insert_many(initial)
        print("✅ Products seeded.")

def seed_admin():
    if not users_col.find_one({"email": "admin@green.com"}):
        users_col.insert_one({
            "name":     "Admin",
            "email":    "admin@green.com",
            "password": generate_password_hash("admin123"),
            "role":     "admin",
            "created_at": datetime.utcnow()
        })
        print("✅ Admin user seeded.")

# ══════════════════════════════════════════════════════════════════════════════
#  AUTH ROUTES
# ══════════════════════════════════════════════════════════════════════════════

@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/auth/signup", methods=["POST"])
def signup():
    data = request.get_json()
    name     = data.get("name", "").strip()
    email    = data.get("email", "").strip().lower()
    password = data.get("password", "").strip()

    if not name or not email or not password:
        return jsonify({"success": False, "message": "All fields are required."}), 400

    if users_col.find_one({"email": email}):
        return jsonify({"success": False, "message": "Email already registered."}), 409

    hashed = generate_password_hash(password)
    result = users_col.insert_one({
        "name":       name,
        "email":      email,
        "password":   hashed,
        "role":       "user",
        "created_at": datetime.utcnow()
    })

    user_id = str(result.inserted_id)
    session["user_id"]   = user_id
    session["user_name"] = name
    session["user_role"] = "user"

    return jsonify({"success": True, "user": {"id": user_id, "name": name, "role": "user"}}), 201


@app.route("/api/auth/login", methods=["POST"])
def login():
    data     = request.get_json()
    email    = data.get("email", "").strip().lower()
    password = data.get("password", "").strip()

    user = users_col.find_one({"email": email})
    if not user or not check_password_hash(user["password"], password):
        return jsonify({"success": False, "message": "Invalid email or password."}), 401

    session["user_id"]   = str(user["_id"])
    session["user_name"] = user["name"]
    session["user_role"] = user["role"]

    return jsonify({
        "success": True,
        "user": {
            "id":   str(user["_id"]),
            "name": user["name"],
            "role": user["role"]
        }
    })


@app.route("/api/auth/logout", methods=["POST"])
def logout():
    session.clear()
    return jsonify({"success": True})


@app.route("/api/auth/me")
def me():
    if "user_id" not in session:
        return jsonify({"logged_in": False}), 401
    return jsonify({
        "logged_in": True,
        "user": {
            "id":   session["user_id"],
            "name": session["user_name"],
            "role": session["user_role"]
        }
    })


# ══════════════════════════════════════════════════════════════════════════════
#  PRODUCTS ROUTES
# ══════════════════════════════════════════════════════════════════════════════

@app.route("/api/products", methods=["GET"])
def get_products():
    category = request.args.get("category", "")
    search   = request.args.get("search", "")

    query = {}
    if category and category != "All":
        query["category"] = category
    if search:
        query["name"] = {"$regex": search, "$options": "i"}

    docs = list(products_col.find(query))
    return jsonify(serialize_list(docs))


@app.route("/api/products/<product_id>", methods=["GET"])
def get_product(product_id):
    try:
        doc = products_col.find_one({"_id": ObjectId(product_id)})
    except InvalidId:
        return jsonify({"error": "Invalid ID"}), 400
    if not doc:
        return jsonify({"error": "Not found"}), 404
    return jsonify(serialize(doc))


@app.route("/api/products", methods=["POST"])
def create_product():
    if session.get("user_role") != "admin":
        return jsonify({"error": "Forbidden"}), 403

    data = request.get_json()
    required = ["name", "emoji", "price", "unit", "category", "stock"]
    for field in required:
        if not data.get(field) and data.get(field) != 0:
            return jsonify({"error": f"'{field}' is required"}), 400

    doc = {
        "name":       data["name"].strip(),
        "emoji":      data.get("emoji", "🥦"),
        "price":      int(data["price"]),
        "unit":       data["unit"],
        "category":   data["category"],
        "stock":      int(data["stock"]),
        "badge":      data.get("badge", "fresh"),
        "created_at": datetime.utcnow()
    }
    result = products_col.insert_one(doc)
    doc["_id"] = str(result.inserted_id)
    return jsonify(doc), 201


@app.route("/api/products/<product_id>", methods=["PUT"])
def update_product(product_id):
    if session.get("user_role") != "admin":
        return jsonify({"error": "Forbidden"}), 403
    try:
        oid = ObjectId(product_id)
    except InvalidId:
        return jsonify({"error": "Invalid ID"}), 400

    data    = request.get_json()
    allowed = ["name", "emoji", "price", "unit", "category", "stock", "badge"]
    update  = {k: data[k] for k in allowed if k in data}

    if "price" in update:  update["price"]  = int(update["price"])
    if "stock" in update:  update["stock"]  = int(update["stock"])

    products_col.update_one({"_id": oid}, {"$set": update})
    doc = products_col.find_one({"_id": oid})
    return jsonify(serialize(doc))


@app.route("/api/products/<product_id>", methods=["DELETE"])
def delete_product(product_id):
    if session.get("user_role") != "admin":
        return jsonify({"error": "Forbidden"}), 403
    try:
        oid = ObjectId(product_id)
    except InvalidId:
        return jsonify({"error": "Invalid ID"}), 400

    result = products_col.delete_one({"_id": oid})
    if result.deleted_count == 0:
        return jsonify({"error": "Not found"}), 404
    return jsonify({"success": True})


# ══════════════════════════════════════════════════════════════════════════════
#  CART ROUTES (stored in MongoDB per user)
# ══════════════════════════════════════════════════════════════════════════════

def get_user_cart():
    user_id = session.get("user_id")
    if not user_id:
        return None
    cart = cart_col.find_one({"user_id": user_id})
    if not cart:
        cart = {"user_id": user_id, "items": []}
        cart_col.insert_one(cart)
    return cart


@app.route("/api/cart", methods=["GET"])
def get_cart():
    if "user_id" not in session:
        return jsonify({"error": "Not logged in"}), 401
    cart = get_user_cart()
    return jsonify(cart["items"])


@app.route("/api/cart/add", methods=["POST"])
def add_to_cart():
    if "user_id" not in session:
        return jsonify({"error": "Not logged in"}), 401

    data       = request.get_json()
    product_id = data.get("product_id")
    qty        = int(data.get("qty", 1))

    try:
        product = products_col.find_one({"_id": ObjectId(product_id)})
    except InvalidId:
        return jsonify({"error": "Invalid product"}), 400
    if not product:
        return jsonify({"error": "Product not found"}), 404

    user_id = session["user_id"]
    cart    = cart_col.find_one({"user_id": user_id})

    if not cart:
        cart_col.insert_one({"user_id": user_id, "items": []})
        cart = cart_col.find_one({"user_id": user_id})

    items  = cart.get("items", [])
    existing = next((i for i in items if i["product_id"] == product_id), None)

    if existing:
        existing["qty"] += qty
    else:
        items.append({
            "product_id": product_id,
            "name":       product["name"],
            "emoji":      product["emoji"],
            "price":      product["price"],
            "unit":       product["unit"],
            "qty":        qty
        })

    cart_col.update_one({"user_id": user_id}, {"$set": {"items": items}})
    return jsonify({"success": True, "cart": items})


@app.route("/api/cart/update", methods=["PUT"])
def update_cart():
    if "user_id" not in session:
        return jsonify({"error": "Not logged in"}), 401

    data       = request.get_json()
    product_id = data.get("product_id")
    qty        = int(data.get("qty", 0))
    user_id    = session["user_id"]

    cart  = cart_col.find_one({"user_id": user_id})
    items = cart.get("items", []) if cart else []

    if qty <= 0:
        items = [i for i in items if i["product_id"] != product_id]
    else:
        for item in items:
            if item["product_id"] == product_id:
                item["qty"] = qty

    cart_col.update_one({"user_id": user_id}, {"$set": {"items": items}}, upsert=True)
    return jsonify({"success": True, "cart": items})


@app.route("/api/cart/clear", methods=["DELETE"])
def clear_cart():
    if "user_id" not in session:
        return jsonify({"error": "Not logged in"}), 401
    cart_col.update_one({"user_id": session["user_id"]}, {"$set": {"items": []}})
    return jsonify({"success": True})


# ══════════════════════════════════════════════════════════════════════════════
#  ORDERS ROUTES
# ══════════════════════════════════════════════════════════════════════════════

@app.route("/api/orders", methods=["POST"])
def place_order():
    if "user_id" not in session:
        return jsonify({"error": "Not logged in"}), 401

    user_id  = session["user_id"]
    cart     = cart_col.find_one({"user_id": user_id})
    items    = cart.get("items", []) if cart else []

    if not items:
        return jsonify({"error": "Cart is empty"}), 400

    subtotal = sum(i["price"] * i["qty"] for i in items)
    delivery = 0 if subtotal > 299 else 40
    total    = subtotal + delivery

    order = {
        "user_id":    user_id,
        "user_name":  session["user_name"],
        "items":      items,
        "subtotal":   subtotal,
        "delivery":   delivery,
        "total":      total,
        "status":     "pending",
        "created_at": datetime.utcnow()
    }

    result   = orders_col.insert_one(order)
    order_id = str(result.inserted_id)

    # Clear cart after order
    cart_col.update_one({"user_id": user_id}, {"$set": {"items": []}})

    return jsonify({
        "success":  True,
        "order_id": f"#ORD-{order_id[-6:].upper()}",
        "total":    total
    }), 201


@app.route("/api/orders/my", methods=["GET"])
def my_orders():
    if "user_id" not in session:
        return jsonify({"error": "Not logged in"}), 401

    orders = list(orders_col.find(
        {"user_id": session["user_id"]},
        sort=[("created_at", -1)]
    ))
    return jsonify(serialize_list(orders))


@app.route("/api/orders", methods=["GET"])
def all_orders():
    if session.get("user_role") != "admin":
        return jsonify({"error": "Forbidden"}), 403

    orders = list(orders_col.find({}, sort=[("created_at", -1)]).limit(50))
    return jsonify(serialize_list(orders))


@app.route("/api/orders/<order_id>/status", methods=["PUT"])
def update_order_status(order_id):
    if session.get("user_role") != "admin":
        return jsonify({"error": "Forbidden"}), 403

    data   = request.get_json()
    status = data.get("status")
    if status not in ["pending", "processing", "delivered", "cancelled"]:
        return jsonify({"error": "Invalid status"}), 400

    try:
        orders_col.update_one({"_id": ObjectId(order_id)}, {"$set": {"status": status}})
    except InvalidId:
        return jsonify({"error": "Invalid ID"}), 400

    return jsonify({"success": True})


# ══════════════════════════════════════════════════════════════════════════════
#  ADMIN STATS
# ══════════════════════════════════════════════════════════════════════════════

@app.route("/api/admin/stats", methods=["GET"])
def admin_stats():
    if session.get("user_role") != "admin":
        return jsonify({"error": "Forbidden"}), 403

    today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)

    total_products  = products_col.count_documents({})
    total_users     = users_col.count_documents({"role": "user"})
    orders_today    = orders_col.count_documents({"created_at": {"$gte": today_start}})

    revenue_pipeline = [
        {"$match": {"created_at": {"$gte": today_start}}},
        {"$group": {"_id": None, "total": {"$sum": "$total"}}}
    ]
    revenue_result = list(orders_col.aggregate(revenue_pipeline))
    revenue_today  = revenue_result[0]["total"] if revenue_result else 0

    return jsonify({
        "total_products": total_products,
        "total_users":    total_users,
        "orders_today":   orders_today,
        "revenue_today":  revenue_today
    })


# ══════════════════════════════════════════════════════════════════════════════
#  ENTRYPOINT
# ══════════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    seed_products()
    seed_admin()
    app.run(debug=True, port=5000)
