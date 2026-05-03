# 🥬 GreenBasket — Flask + MongoDB Vegetable Store

## Project Structure

```
greenbasket/
├── app.py                  ← Flask application (all API routes)
├── requirements.txt        ← Python dependencies
├── .env                    ← Environment variables (MongoDB URI)
├── templates/
│   └── index.html          ← Single-page HTML template
└── static/
    ├── css/
    │   └── style.css       ← All styles
    └── js/
        └── app.js          ← Frontend logic (fetch API calls)
```

## Setup & Run

### 1. Install dependencies
```bash
pip install -r requirements.txt
```

### 2. Configure MongoDB
Edit `.env` and replace `<username>` and `<password>` with your MongoDB Atlas credentials:
```
MONGO_URI=mongodb+srv://username:password@cluster0.mongodb.net/greenbasket?retryWrites=true&w=majority
SECRET_KEY=your-secret-key-here
```

### 3. Load environment variables & run
```bash
# On Linux/Mac:
export $(cat .env | xargs)
python app.py

# On Windows (PowerShell):
$env:MONGO_URI="mongodb+srv://username:password@cluster0.mongodb.net/greenbasket?retryWrites=true&w=majority"
$env:SECRET_KEY="greenbasket-secret"
python app.py
```

The app will be available at: **http://localhost:5000**

On first run, the app automatically seeds:
- 12 default vegetable products into MongoDB
- An admin user: `admin@green.com` / `admin123`

---

## API Endpoints

### Auth
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/signup` | Register new user |
| POST | `/api/auth/login` | Login |
| POST | `/api/auth/logout` | Logout |
| GET  | `/api/auth/me` | Get current session user |

### Products
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/products?search=&category=` | List products (with filters) |
| GET | `/api/products/<id>` | Get single product |
| POST | `/api/products` | Add product *(admin only)* |
| PUT | `/api/products/<id>` | Update product *(admin only)* |
| DELETE | `/api/products/<id>` | Delete product *(admin only)* |

### Cart
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/cart` | Get user's cart |
| POST | `/api/cart/add` | Add item to cart |
| PUT | `/api/cart/update` | Update item quantity |
| DELETE | `/api/cart/clear` | Clear cart |

### Orders
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/orders` | Place order from cart |
| GET | `/api/orders/my` | Get current user's orders |
| GET | `/api/orders` | Get all orders *(admin only)* |
| PUT | `/api/orders/<id>/status` | Update order status *(admin only)* |

### Admin
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/stats` | Dashboard stats *(admin only)* |

---

## MongoDB Collections

| Collection | Description |
|------------|-------------|
| `users` | Registered users (hashed passwords) |
| `products` | Vegetable catalog |
| `carts` | Per-user cart (one doc per user) |
| `orders` | Placed orders with items snapshot |
