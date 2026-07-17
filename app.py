from flask import Flask, render_template, jsonify, abort, request, send_from_directory, session, redirect, url_for, Response
import requests as http_requests
from dotenv import load_dotenv
from psycopg2.extensions import adapt
import psycopg2
import pandas as pd
import json
import os
import time
import hashlib
from concurrent.futures import ThreadPoolExecutor, as_completed

load_dotenv()

app = Flask(__name__)
app.secret_key = os.getenv("SECRET_KEY", os.urandom(24).hex())

DATABASE_URL = os.getenv("DATABASE_URL")
DASHBOARD_PASSWORD = "Quess"
ADMIN_PASSWORD = "ravisharmaisadmin"


from psycopg2 import pool as _pool
_conn_pool = None

def _get_pool():
    global _conn_pool
    if _conn_pool is None:
        _conn_pool = _pool.ThreadedConnectionPool(2, 20, DATABASE_URL)
    return _conn_pool

def get_conn():
    return _get_pool().getconn()

def put_conn(conn):
    _get_pool().putconn(conn)

# ── Simple TTL cache ─────────────────────────────────────
_cache = {}
CACHE_TTL = 300  # 5 minutes

def cache_get(key):
    entry = _cache.get(key)
    if entry and time.time() - entry['ts'] < CACHE_TTL:
        return entry['data']
    return None

def cache_set(key, data):
    _cache[key] = {'data': data, 'ts': time.time()}


def df_to_payload(df):
    return {
        "columns": df.columns.tolist(),
        "rows": json.loads(df.to_json(orient="records", date_format="iso")),
    }


def safe_literal(value):
    return adapt(value).getquoted().decode()


@app.route("/api/image-proxy")
def image_proxy():
    url = request.args.get("url", "")
    if not url or "s3" not in url.lower():
        abort(400)
    try:
        r = http_requests.get(url, timeout=10)
        return Response(r.content, content_type=r.headers.get("Content-Type", "image/jpeg"))
    except Exception:
        abort(502)


@app.route("/assets/<path:filename>")
def assets(filename):
    return send_from_directory(os.path.join(app.root_path, "assets"), filename)


@app.route("/login", methods=["GET", "POST"])
def login():
    error = ""
    if request.method == "POST":
        if request.form.get("password") == DASHBOARD_PASSWORD:
            session["authenticated"] = True
            return redirect(url_for("dashboard"))
        error = "Incorrect password. Please try again."
    return render_template("login.html", error=error)


@app.route("/logout")
def logout():
    session.pop("authenticated", None)
    return redirect(url_for("login"))


@app.route("/")
def dashboard():
    if not session.get("authenticated"):
        return redirect(url_for("login"))
    return render_template("dashboard.html")


@app.route("/api/widgets")
def get_widgets():
    cached = cache_get('dashboard_widgets')
    if cached:
        return jsonify(cached)
    conn = get_conn()
    df = pd.read_sql(
        "SELECT id, widget_name, chart_type, display_order FROM dashboard_widgets WHERE is_active = true ORDER BY display_order",
        conn,
    )
    put_conn(conn)
    result = df.to_dict(orient="records")
    cache_set('dashboard_widgets', result)
    return jsonify(result)


@app.route("/api/regions")
def get_regions():
    conn = get_conn()
    df = pd.read_sql(
        "SELECT DISTINCT region FROM samsungdashneon WHERE region IS NOT NULL ORDER BY region",
        conn,
    )
    put_conn(conn)
    return jsonify(df["region"].tolist())


@app.route("/api/types")
def get_types():
    conn = get_conn()
    df = pd.read_sql(
        "SELECT DISTINCT trim(type) AS type FROM samsungdashneon WHERE type IS NOT NULL AND trim(type) != '' ORDER BY 1",
        conn,
    )
    put_conn(conn)
    return jsonify(df["type"].tolist())


@app.route("/api/channels")
def get_channels():
    conn = get_conn()
    df = pd.read_sql(
        "SELECT DISTINCT trim(channel) AS channel FROM samsungdashneon WHERE channel IS NOT NULL AND trim(channel) != '' ORDER BY 1",
        conn,
    )
    put_conn(conn)
    return jsonify(df["channel"].tolist())


@app.route("/api/ases")
def get_ases():
    conn = get_conn()
    df = pd.read_sql(
        "SELECT DISTINCT trim(ase) AS ase FROM samsungdashneon WHERE ase IS NOT NULL AND trim(ase) != '' ORDER BY 1",
        conn,
    )
    put_conn(conn)
    return jsonify(df["ase"].tolist())


@app.route("/api/zses")
def get_zses():
    conn = get_conn()
    df = pd.read_sql(
        "SELECT DISTINCT trim(zse) AS zse FROM samsungdashneon WHERE zse IS NOT NULL AND trim(zse) != '' ORDER BY 1",
        conn,
    )
    put_conn(conn)
    return jsonify(df["zse"].tolist())


@app.route("/api/zse-ase-map")
def get_zse_ase_map():
    conn = get_conn()
    df = pd.read_sql(
        """SELECT DISTINCT trim(zse) AS zse, trim(ase) AS ase
           FROM samsungdashneon
           WHERE zse IS NOT NULL AND trim(zse) != ''
             AND ase IS NOT NULL AND trim(ase) != ''
           ORDER BY 1, 2""",
        conn,
    )
    put_conn(conn)
    # Return as list of {zse, ase} pairs
    return jsonify(df.to_dict(orient="records"))


@app.route("/api/attendance_types")
def get_attendance_types():
    conn = get_conn()
    df = pd.read_sql(
        "SELECT DISTINCT trim(attendance_type) AS atype FROM samsungdashneon WHERE attendance_type IS NOT NULL AND trim(attendance_type) != '' ORDER BY 1",
        conn,
    )
    put_conn(conn)
    return jsonify(df["atype"].tolist())


@app.route("/api/filter-options")
def get_filter_options():
    # Check if any filter is active
    has_filters = any([
        request.args.get("region") and request.args.get("region") != "All",
        request.args.getlist("type"),
        request.args.getlist("channel"),
        request.args.get("ase") and request.args.get("ase") != "All",
        request.args.get("zse") and request.args.get("zse") != "All",
        request.args.getlist("atype"),
        request.args.get("date_from"),
        request.args.get("date_to"),
    ])
    if not has_filters:
        cached = cache_get('filter_options_all')
        if cached:
            return jsonify(cached)

    conn = get_conn()

    where = "WHERE 1=1"

    region = request.args.get("region")
    if region and region != "All":
        where += f" AND region = {safe_literal(region)}"

    types = [t for t in request.args.getlist("type") if t]
    if types:
        literals = ", ".join(safe_literal(t.lower().strip()) for t in types)
        where += f" AND lower(trim(type)) IN ({literals})"

    channels = [c for c in request.args.getlist("channel") if c]
    if channels:
        literals = ", ".join(safe_literal(c.strip()) for c in channels)
        where += f" AND trim(channel) IN ({literals})"

    ase = request.args.get("ase")
    if ase and ase != "All":
        where += f" AND trim(ase) = {safe_literal(ase.strip())}"

    zse = request.args.get("zse")
    if zse and zse != "All":
        where += f" AND trim(zse) = {safe_literal(zse.strip())}"

    atypes = [a for a in request.args.getlist("atype") if a]
    if atypes:
        literals = ", ".join(safe_literal(a.strip()) for a in atypes)
        where += f" AND trim(attendance_type) IN ({literals})"

    date_from = request.args.get("date_from")
    date_to = request.args.get("date_to")
    if date_from:
        where += f" AND attendance_date::date >= {safe_literal(date_from)}"
    if date_to:
        where += f" AND attendance_date::date <= {safe_literal(date_to)}"

    sql = f"""
        SELECT
            COALESCE(array_agg(DISTINCT region ORDER BY region) FILTER (WHERE region IS NOT NULL), ARRAY[]::text[]) AS regions,
            COALESCE(array_agg(DISTINCT trim(type) ORDER BY trim(type)) FILTER (WHERE type IS NOT NULL AND trim(type) != ''), ARRAY[]::text[]) AS types,
            COALESCE(array_agg(DISTINCT trim(channel) ORDER BY trim(channel)) FILTER (WHERE channel IS NOT NULL AND trim(channel) != ''), ARRAY[]::text[]) AS channels,
            COALESCE(array_agg(DISTINCT trim(ase) ORDER BY trim(ase)) FILTER (WHERE ase IS NOT NULL AND trim(ase) != ''), ARRAY[]::text[]) AS ases,
            COALESCE(array_agg(DISTINCT trim(zse) ORDER BY trim(zse)) FILTER (WHERE zse IS NOT NULL AND trim(zse) != ''), ARRAY[]::text[]) AS zses,
            COALESCE(array_agg(DISTINCT trim(attendance_type) ORDER BY trim(attendance_type)) FILTER (WHERE attendance_type IS NOT NULL AND trim(attendance_type) != ''), ARRAY[]::text[]) AS atypes,
            COALESCE(array_agg(DISTINCT CAST(user_id AS TEXT) ORDER BY CAST(user_id AS TEXT)) FILTER (WHERE user_id IS NOT NULL), ARRAY[]::text[]) AS user_ids
        FROM samsungdashneon
        {where}
    """

    cur = conn.cursor()
    cur.execute(sql)
    row = cur.fetchone()
    put_conn(conn)

    result = {
        "regions": row[0] or [],
        "types": row[1] or [],
        "channels": row[2] or [],
        "ases": row[3] or [],
        "zses": row[4] or [],
        "atypes": row[5] or [],
        "user_ids": row[6] or [],
    }
    if not has_filters:
        cache_set('filter_options_all', result)
    return jsonify(result)


@app.route("/api/widget-data/<int:widget_id>")
def get_widget_data(widget_id):
    conn = get_conn()
    cur = conn.cursor()
    cur.execute(
        "SELECT sql_query FROM dashboard_widgets WHERE id = %s AND is_active = true",
        (widget_id,),
    )
    row = cur.fetchone()
    if row is None:
        put_conn(conn)
        abort(404)

    sql = row[0]

    # Region filter
    region = request.args.get("region")
    if region and region != "All":
        sql = sql.replace("{region_filter}", f"AND region = {safe_literal(region)}")
    else:
        sql = sql.replace("{region_filter}", "")

    # Type filter (multi-select)
    types = [t for t in request.args.getlist("type") if t]
    if types:
        literals = ", ".join(safe_literal(t.lower().strip()) for t in types)
        sql = sql.replace("{type_filter}", f"AND lower(trim(type)) IN ({literals})")
    else:
        sql = sql.replace("{type_filter}", "")

    # Channel filter (multi-select)
    channels = [c for c in request.args.getlist("channel") if c]
    if channels:
        literals = ", ".join(safe_literal(c.strip()) for c in channels)
        sql = sql.replace("{channel_filter}", f"AND trim(channel) IN ({literals})")
    else:
        sql = sql.replace("{channel_filter}", "")

    # ASE filter
    ase = request.args.get("ase")
    if ase and ase != "All":
        sql = sql.replace("{ase_filter}", f"AND trim(ase) = {safe_literal(ase.strip())}")
    else:
        sql = sql.replace("{ase_filter}", "")

    # Date filter (from / to)
    date_from = request.args.get("date_from")
    date_to = request.args.get("date_to")
    date_parts = []
    if date_from:
        date_parts.append(f"AND attendance_date::date >= {safe_literal(date_from)}")
    if date_to:
        date_parts.append(f"AND attendance_date::date <= {safe_literal(date_to)}")
    sql = sql.replace("{date_filter}", " ".join(date_parts))

    # ZSE filter
    zse = request.args.get("zse")
    if zse and zse != "All":
        sql = sql.replace("{zse_filter}", f"AND trim(zse) = {safe_literal(zse.strip())}")
    else:
        sql = sql.replace("{zse_filter}", "")

    # Attendance type filter (multi-select)
    atypes = [a for a in request.args.getlist("atype") if a]
    if atypes:
        literals = ", ".join(safe_literal(a.strip()) for a in atypes)
        sql = sql.replace("{atype_filter}", f"AND trim(attendance_type) IN ({literals})")
    else:
        sql = sql.replace("{atype_filter}", "")

    # User ID filter
    user_id = request.args.get("user_id")
    if user_id and user_id.strip():
        sql = sql.replace("{user_filter}", f"AND CAST(user_id AS TEXT) ILIKE {safe_literal('%' + user_id.strip() + '%')}")
    else:
        sql = sql.replace("{user_filter}", "")

    df = pd.read_sql(sql, conn)
    put_conn(conn)
    return jsonify(df_to_payload(df))


def _aget(args, key, default=None):
    """Get single value from either request.args or a plain dict."""
    v = args.get(key, default)
    if isinstance(v, list): return v[0] if v else default
    return v

def _agetlist(args, key):
    """Get list of values from either request.args (via getlist) or a plain dict."""
    if hasattr(args, 'getlist'):
        return [x for x in args.getlist(key) if x]
    v = args.get(key, [])
    if isinstance(v, list): return [x for x in v if x]
    return [v] if v else []

def apply_filters_to_sql(sql, args):
    """Apply all dashboard filter params to a SQL template string."""
    region = _aget(args, "region")
    sql = sql.replace("{region_filter}", f"AND region = {safe_literal(region)}" if region and region != "All" else "")

    types = _agetlist(args, "type")
    sql = sql.replace("{type_filter}", f"AND lower(trim(type)) IN ({', '.join(safe_literal(t.lower().strip()) for t in types)})" if types else "")

    channels = _agetlist(args, "channel")
    sql = sql.replace("{channel_filter}", f"AND trim(channel) IN ({', '.join(safe_literal(c.strip()) for c in channels)})" if channels else "")

    ase = _aget(args, "ase")
    sql = sql.replace("{ase_filter}", f"AND trim(ase) = {safe_literal(ase.strip())}" if ase and ase != "All" else "")

    date_from = _aget(args, "date_from")
    date_to   = _aget(args, "date_to")
    date_parts = []
    if date_from: date_parts.append(f"AND attendance_date::date >= {safe_literal(date_from)}")
    if date_to:   date_parts.append(f"AND attendance_date::date <= {safe_literal(date_to)}")
    sql = sql.replace("{date_filter}", " ".join(date_parts))

    zse = _aget(args, "zse")
    sql = sql.replace("{zse_filter}", f"AND trim(zse) = {safe_literal(zse.strip())}" if zse and zse != "All" else "")

    atypes = _agetlist(args, "atype")
    sql = sql.replace("{atype_filter}", f"AND trim(attendance_type) IN ({', '.join(safe_literal(a.strip()) for a in atypes)})" if atypes else "")

    user_id = _aget(args, "user_id")
    sql = sql.replace("{user_filter}", f"AND CAST(user_id AS TEXT) ILIKE {safe_literal('%' + user_id.strip() + '%')}" if user_id and user_id.strip() else "")

    return sql


def _run_widget_query(widget_row, args_dict):
    """Run a single widget SQL and return (widget_id, payload). Used in thread pool."""
    widget_id, sql_query = widget_row
    sql = apply_filters_to_sql(sql_query, args_dict)
    conn = get_conn()
    try:
        df = pd.read_sql(sql, conn)
        return widget_id, df_to_payload(df)
    except Exception:
        return widget_id, {"columns": [], "rows": []}
    finally:
        put_conn(conn)


@app.route("/api/all-widget-data")
def get_all_widget_data():
    # Build a cache key from the filter params
    cache_key = "all_widgets:" + hashlib.md5(request.query_string).hexdigest()
    cached = cache_get(cache_key)
    if cached:
        return jsonify(cached)

    # Fetch widget SQL queries from DB
    conn = get_conn()
    try:
        cur = conn.cursor()
        cur.execute("SELECT id, sql_query FROM dashboard_widgets WHERE is_active = true AND id != 16 ORDER BY display_order")
        widget_rows = cur.fetchall()
    finally:
        put_conn(conn)

    # Copy request.args to a plain dict (safe to pass across threads)
    args_dict = dict(request.args.lists())
    # Flatten single-value keys so .get() works naturally
    flat_args = {k: (v[0] if len(v) == 1 else v) for k, v in args_dict.items()}

    # Run all widget queries in parallel threads
    results = {}
    with ThreadPoolExecutor(max_workers=8) as executor:
        futures = {executor.submit(_run_widget_query, row, flat_args): row[0] for row in widget_rows}
        for future in as_completed(futures):
            try:
                widget_id, payload = future.result()
                results[widget_id] = payload
            except Exception:
                pass

    # Market availability in same bundle
    try:
        results['market'] = _get_market_availability(flat_args)
    except Exception:
        results['market'] = {"columns": [], "rows": []}

    cache_set(cache_key, results)
    return jsonify(results)


def _get_market_availability(args):
    region   = _aget(args, "region")
    zse      = _aget(args, "zse")
    ase      = _aget(args, "ase")
    date_from = _aget(args, "date_from")
    date_to   = _aget(args, "date_to")
    types    = _agetlist(args, "type")
    channels = _agetlist(args, "channel")
    atypes   = _agetlist(args, "atype")
    user_id  = _aget(args, "user_id")

    where = ("WHERE region IS NOT NULL AND trim(region) NOT IN ('', 'NA') "
             "AND attendance_type IS NOT NULL AND trim(attendance_type) != ''")
    if region and region != "All":
        where += f" AND region = {safe_literal(region)}"
    if zse and zse != "All":
        where += f" AND trim(zse) = {safe_literal(zse.strip())}"
    if ase and ase != "All":
        where += f" AND trim(ase) = {safe_literal(ase.strip())}"
    if date_from:
        where += f" AND attendance_date::date >= {safe_literal(date_from)}"
    if date_to:
        where += f" AND attendance_date::date <= {safe_literal(date_to)}"
    if types:
        where += f" AND lower(trim(type)) IN ({', '.join(safe_literal(t.lower().strip()) for t in types)})"
    if channels:
        where += f" AND trim(channel) IN ({', '.join(safe_literal(c.strip()) for c in channels)})"
    if atypes:
        where += f" AND trim(attendance_type) IN ({', '.join(safe_literal(a.strip()) for a in atypes)})"
    if user_id and user_id.strip():
        where += f" AND CAST(user_id AS TEXT) ILIKE {safe_literal('%' + user_id.strip() + '%')}"

    sql = f"""
        SELECT
            attendance_date::date AS "Date",
            COUNT(*) AS "Total",
            COUNT(CASE WHEN lower(trim(attendance_type)) IN (
                'present','gate meeting','gate_meeting','gm','training',
                'half day','half_day','half-day'
            ) THEN 1 END) AS "Available in Market",
            COUNT(CASE WHEN lower(trim(attendance_type)) IN (
                'absent','holiday','leave','not marked','not_marked','notmarked',
                'outlet closed','outlet_closed','outlet close','weekoff',
                'week off','week_off','week-off'
            ) THEN 1 END) AS "Not Available in Market"
        FROM samsungdashneon
        {where}
        GROUP BY attendance_date::date
        ORDER BY attendance_date::date
    """
    conn = get_conn()
    try:
        df = pd.read_sql(sql, conn)
        return df_to_payload(df)
    finally:
        put_conn(conn)


@app.route("/api/market-availability")
def market_availability():
    conn = get_conn()

    region   = request.args.get("region")
    zse      = request.args.get("zse")
    ase      = request.args.get("ase")
    date_from = request.args.get("date_from")
    date_to   = request.args.get("date_to")
    types    = [t for t in request.args.getlist("type") if t]
    channels = [c for c in request.args.getlist("channel") if c]
    atypes   = [a for a in request.args.getlist("atype") if a]
    user_id  = request.args.get("user_id")

    where = ("WHERE region IS NOT NULL AND trim(region) NOT IN ('', 'NA') "
             "AND attendance_type IS NOT NULL AND trim(attendance_type) != ''")

    if region and region != "All":
        where += f" AND region = {safe_literal(region)}"
    if zse and zse != "All":
        where += f" AND trim(zse) = {safe_literal(zse.strip())}"
    if ase and ase != "All":
        where += f" AND trim(ase) = {safe_literal(ase.strip())}"
    if date_from:
        where += f" AND attendance_date::date >= {safe_literal(date_from)}"
    if date_to:
        where += f" AND attendance_date::date <= {safe_literal(date_to)}"
    if types:
        literals = ", ".join(safe_literal(t.lower().strip()) for t in types)
        where += f" AND lower(trim(type)) IN ({literals})"
    if channels:
        literals = ", ".join(safe_literal(c.strip()) for c in channels)
        where += f" AND trim(channel) IN ({literals})"
    if atypes:
        literals = ", ".join(safe_literal(a.strip()) for a in atypes)
        where += f" AND trim(attendance_type) IN ({literals})"
    if user_id and user_id.strip():
        where += f" AND CAST(user_id AS TEXT) ILIKE {safe_literal('%' + user_id.strip() + '%')}"

    sql = f"""
        SELECT
            attendance_date::date AS "Date",
            COUNT(*) AS "Total",
            COUNT(CASE WHEN lower(trim(attendance_type)) IN (
                'present','gate meeting','gate_meeting','gm','training',
                'half day','half_day','half-day'
            ) THEN 1 END) AS "Available in Market",
            COUNT(CASE WHEN lower(trim(attendance_type)) IN (
                'absent','holiday','leave','not marked','not_marked','notmarked',
                'outlet closed','outlet_closed','outlet close','weekoff',
                'week off','week_off','week-off'
            ) THEN 1 END) AS "Not Available in Market"
        FROM samsungdashneon
        {where}
        GROUP BY attendance_date::date
        ORDER BY attendance_date::date
    """
    df = pd.read_sql(sql, conn)
    put_conn(conn)
    return jsonify(df_to_payload(df))


# ══════════════════════════════════════════
# ADMIN AUTH FOR EXPORT
# ══════════════════════════════════════════

@app.route("/api/verify-admin", methods=["POST"])
def verify_admin():
    data = request.get_json()
    if data.get("password") == ADMIN_PASSWORD:
        return jsonify({"success": True})
    return jsonify({"success": False})


# ══════════════════════════════════════════
# EMAIL EXPORT
# ══════════════════════════════════════════

@app.route("/api/send-email", methods=["POST"])
def send_email():
    import base64
    import tempfile

    data = request.get_json()
    to_email = data.get("to", "")
    subject = data.get("subject", "Dashboard Report")
    body_text = data.get("body", "")
    image_data = data.get("image", "")

    try:
        import win32com.client
        import pythoncom
        pythoncom.CoInitialize()

        # Save image to temp file
        img_path = os.path.join(tempfile.gettempdir(), "dashboard_snapshot.png")
        if image_data and "," in image_data:
            img_bytes = base64.b64decode(image_data.split(",")[1])
            with open(img_path, "wb") as f:
                f.write(img_bytes)

        outlook = win32com.client.Dispatch("Outlook.Application")
        mail = outlook.CreateItem(0)
        mail.To = to_email
        mail.Subject = subject

        if os.path.exists(img_path):
            attachment = mail.Attachments.Add(img_path)
            cid = "dashboard_img"
            attachment.PropertyAccessor.SetProperty(
                "http://schemas.microsoft.com/mapi/proptag/0x3712001F", cid
            )

        mail.HTMLBody = f"""
        <html><body style="font-family:Segoe UI,Arial,sans-serif;color:#333;">
            <p>{body_text.replace(chr(10), '<br>')}</p>
            <br>
            <p><strong>Dashboard Snapshot:</strong></p>
            <img src="cid:dashboard_img" style="max-width:100%;border:1px solid #ddd;border-radius:8px;">
            <br><br>
        </body></html>
        """

        mail.Display()
        pythoncom.CoUninitialize()
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)})


# ══════════════════════════════════════════
# NON SEC DASHBOARD
# ══════════════════════════════════════════

@app.route("/nonsec")
def nonsec_dashboard():
    if not session.get("authenticated"):
        return redirect(url_for("login"))
    return render_template("nonsec.html")


@app.route("/api/nonsec/widgets")
def get_nonsec_widgets():
    conn = get_conn()
    df = pd.read_sql(
        "SELECT id, widget_name, chart_type, display_order FROM nonsec_widgets WHERE is_active = true ORDER BY display_order",
        conn,
    )
    put_conn(conn)
    return jsonify(df.to_dict(orient="records"))


@app.route("/api/nonsec/filter-options")
def get_nonsec_filter_options():
    conn = get_conn()
    where = "WHERE 1=1"

    region = request.args.get("region")
    if region and region != "All":
        where += f" AND region = {safe_literal(region)}"

    zse = request.args.get("zse")
    if zse and zse != "All":
        where += f" AND trim(zse) = {safe_literal(zse.strip())}"

    ase = request.args.get("ase")
    if ase and ase != "All":
        where += f" AND trim(ase) = {safe_literal(ase.strip())}"

    channels = [c for c in request.args.getlist("channel") if c]
    if channels:
        literals = ", ".join(safe_literal(c.strip()) for c in channels)
        where += f" AND trim(channel) IN ({literals})"

    tiers = [t for t in request.args.getlist("tier") if t]
    if tiers:
        literals = ", ".join(safe_literal(t.strip()) for t in tiers)
        where += f" AND trim(tier) IN ({literals})"

    date_val = request.args.get("date")
    if date_val:
        where += f" AND trim(date) = {safe_literal(date_val.strip())}"

    date_from = request.args.get("date_from")
    date_to = request.args.get("date_to")
    if date_from:
        where += f" AND to_date(trim(date), 'DD-Mon-YY') >= {safe_literal(date_from)}"
    if date_to:
        where += f" AND to_date(trim(date), 'DD-Mon-YY') <= {safe_literal(date_to)}"

    user_id = request.args.get("user_id")
    if user_id and user_id.strip():
        where += f" AND ase_ho_id ILIKE {safe_literal('%' + user_id.strip() + '%')}"

    sql = f"""
        SELECT
            COALESCE(array_agg(DISTINCT region ORDER BY region) FILTER (WHERE region IS NOT NULL), ARRAY[]::text[]) AS regions,
            COALESCE(array_agg(DISTINCT trim(zse) ORDER BY trim(zse)) FILTER (WHERE zse IS NOT NULL AND trim(zse) != ''), ARRAY[]::text[]) AS zses,
            COALESCE(array_agg(DISTINCT trim(ase) ORDER BY trim(ase)) FILTER (WHERE ase IS NOT NULL AND trim(ase) != ''), ARRAY[]::text[]) AS ases,
            COALESCE(array_agg(DISTINCT trim(channel) ORDER BY trim(channel)) FILTER (WHERE channel IS NOT NULL AND trim(channel) != ''), ARRAY[]::text[]) AS channels,
            COALESCE(array_agg(DISTINCT trim(tier) ORDER BY trim(tier)) FILTER (WHERE tier IS NOT NULL AND trim(tier) != ''), ARRAY[]::text[]) AS tiers,
            COALESCE(array_agg(DISTINCT trim(date) ORDER BY trim(date)) FILTER (WHERE date IS NOT NULL AND trim(date) != ''), ARRAY[]::text[]) AS dates,
            COALESCE(array_agg(DISTINCT trim(ase_ho_id) ORDER BY trim(ase_ho_id)) FILTER (WHERE ase_ho_id IS NOT NULL AND trim(ase_ho_id) != ''), ARRAY[]::text[]) AS ase_ho_ids
        FROM rtneon {where}
    """
    cur = conn.cursor()
    cur.execute(sql)
    row = cur.fetchone()
    put_conn(conn)
    return jsonify({
        "regions": row[0] or [],
        "zses": row[1] or [],
        "ases": row[2] or [],
        "channels": row[3] or [],
        "tiers": row[4] or [],
        "dates": row[5] or [],
        "ase_ho_ids": row[6] or [],
    })


@app.route("/api/nonsec/widget-data/<int:widget_id>")
def get_nonsec_widget_data(widget_id):
    conn = get_conn()
    cur = conn.cursor()
    cur.execute(
        "SELECT sql_query FROM nonsec_widgets WHERE id = %s AND is_active = true",
        (widget_id,),
    )
    row = cur.fetchone()
    if row is None:
        put_conn(conn)
        abort(404)

    sql = row[0]

    region = request.args.get("region")
    if region and region != "All":
        sql = sql.replace("{region_filter}", f"AND region = {safe_literal(region)}")
    else:
        sql = sql.replace("{region_filter}", "")

    zse = request.args.get("zse")
    if zse and zse != "All":
        sql = sql.replace("{zse_filter}", f"AND trim(zse) = {safe_literal(zse.strip())}")
    else:
        sql = sql.replace("{zse_filter}", "")

    ase = request.args.get("ase")
    if ase and ase != "All":
        sql = sql.replace("{ase_filter}", f"AND trim(ase) = {safe_literal(ase.strip())}")
    else:
        sql = sql.replace("{ase_filter}", "")

    channels = [c for c in request.args.getlist("channel") if c]
    if channels:
        literals = ", ".join(safe_literal(c.strip()) for c in channels)
        sql = sql.replace("{channel_filter}", f"AND trim(channel) IN ({literals})")
    else:
        sql = sql.replace("{channel_filter}", "")

    tiers = [t for t in request.args.getlist("tier") if t]
    if tiers:
        literals = ", ".join(safe_literal(t.strip()) for t in tiers)
        sql = sql.replace("{tier_filter}", f"AND trim(tier) IN ({literals})")
    else:
        sql = sql.replace("{tier_filter}", "")

    date_val = request.args.get("date")
    date_from = request.args.get("date_from")
    date_to = request.args.get("date_to")
    date_parts = []
    if date_val:
        date_parts.append(f"AND trim(date) = {safe_literal(date_val.strip())}")
    if date_from:
        date_parts.append(f"AND to_date(trim(date), 'DD-Mon-YY') >= {safe_literal(date_from)}")
    if date_to:
        date_parts.append(f"AND to_date(trim(date), 'DD-Mon-YY') <= {safe_literal(date_to)}")
    sql = sql.replace("{date_filter}", " ".join(date_parts))

    user_id = request.args.get("user_id")
    if user_id and user_id.strip():
        sql = sql.replace("{user_filter}", f"AND ase_ho_id ILIKE {safe_literal('%' + user_id.strip() + '%')}")
    else:
        sql = sql.replace("{user_filter}", "")

    df = pd.read_sql(sql, conn)
    put_conn(conn)
    return jsonify(df_to_payload(df))


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=True, threaded=True, use_reloader=False)
