# 🌍 Village Location API

A production-style hierarchical location API for Indian states, districts, subdistricts, and villages with autocomplete, filtering, caching, authentication, and rate limiting support.

---

# 🚀 Features

* Hierarchical Location APIs
* Village Search & Autocomplete
* Search Filters
* API Key Authentication
* JWT Authentication
* Redis Caching
* Rate Limiting
* Request Logging
* Pagination Support

---

# 🛠️ Tech Stack

* Node.js
* Express.js
* PostgreSQL
* Upstash Redis
* JWT
* Git & GitHub

---

# 📂 Project Structure

```bash
village_location_api/
│
├── backend/
│   ├── controllers/
│   ├── middleware/
│   ├── routes/
│   ├── utils/
│   ├── db/
│   ├── app.js
│   └── package.json
│
├── data_cleaning/
│   ├── raw/
│   ├── cleaned/
│   └── clean_data.py
│
├── prd/
│
├── .env.example
├── .gitignore
└── README.md
```

---

# ⚙️ Installation

```bash
git clone git@github.com:shreyashambade/village_location_api.git
cd village_location_api/backend
npm install
node app.js
```

---

# 🔑 Authentication

Add API key in request headers:

```http
X-API-Key: your_api_key
```

---

# 📌 Main API Endpoints

## States

```http
GET /api/v1/states
```

## Districts

```http
GET /api/v1/states/:state_code/districts
```

## Subdistricts

```http
GET /api/v1/districts/:district_code/subdistricts
```

## Villages

```http
GET /api/v1/subdistricts/:subdistrict_code/villages
```

## Search

```http
GET /api/v1/search?q=man
```

## Autocomplete

```http
GET /api/v1/autocomplete?q=mah&hierarchyLevel=state
```

---

# 👨‍💻 Author

Shreyash Ambade

GitHub:
https://github.com/shreyashambade
