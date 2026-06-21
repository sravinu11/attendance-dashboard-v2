from flask import Flask, render_template, jsonify, abort, request, send_from_directory, session, redirect, url_for
from dotenv import load_dotenv
from psycopg2.extensions import adapt
import psycopg2
import pandas as pd
import json
import os

load_dotenv()

app = Flask(__name__)
app.secret_key = os.getenv("SECRET_KEY", os.urandom(24).hex())

DATABASE_URL = os.getenv("DATABASE_URL")
DASHBOARD_PASSWORD = "Quessdashboardlive"


def get_conn():
    return psycopg2.connect(DATABASE_URL)


def df_to_payload(df):
    return {
        "columns": df.columns.tolist(),
        "rows": json.loads(df.to_json(orient="records", date_format="iso")),
    }


def safe_literal(value):
    return adapt(value).getquoted().decode()


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
    conn = get_conn()
    df = pd.read_sql(
        "SELECT id, widget_name, chart_type, display_order FROM dashboard_widgets WHERE is_active = true ORDER BY display_order",
        conn,
    )
    conn.close()
    return jsonify(df.to_dict(orient="records"))


@app.route("/api/regions")
def get_regions():
    conn = get_conn()
    df = pd.read_sql(
        "SELECT DISTINCT region FROM samsungdashneon WHERE region IS NOT NULL ORDER BY region",
        conn,
    )
    conn.close()
    return jsonify(df["region"].tolist())


@app.route("/api/types")
def get_types():
    conn = get_conn()
    df = pd.read_sql(
        "SELECT DISTINCT trim(type) AS type FROM samsungdashneon WHERE type IS NOT NULL AND trim(type) != '' ORDER BY 1",
        conn,
    )
    conn.close()
    return jsonify(df["type"].tolist())


@app.route("/api/channels")
def get_channels():
    conn = get_conn()
    df = pd.read_sql(
        "SELECT DISTINCT trim(channel) AS channel FROM samsungdashneon WHERE channel IS NOT NULL AND trim(channel) != '' ORDER BY 1",
        conn,
    )
    conn.close()
    return jsonify(df["channel"].tolist())


@app.route("/api/ases")
def get_ases():
    conn = get_conn()
    df = pd.read_sql(
        "SELECT DISTINCT trim(ase) AS ase FROM samsungdashneon WHERE ase IS NOT NULL AND trim(ase) != '' ORDER BY 1",
        conn,
    )
    conn.close()
    return jsonify(df["ase"].tolist())


@app.route("/api/zses")
def get_zses():
    conn = get_conn()
    df = pd.read_sql(
        "SELECT DISTINCT trim(zse) AS zse FROM samsungdashneon WHERE zse IS NOT NULL AND trim(zse) != '' ORDER BY 1",
        conn,
    )
    conn.close()
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
    conn.close()
    # Return as list of {zse, ase} pairs
    return jsonify(df.to_dict(orient="records"))


@app.route("/api/attendance_types")
def get_attendance_types():
    conn = get_conn()
    df = pd.read_sql(
        "SELECT DISTINCT trim(attendance_type) AS atype FROM samsungdashneon WHERE attendance_type IS NOT NULL AND trim(attendance_type) != '' ORDER BY 1",
        conn,
    )
    conn.close()
    return jsonify(df["atype"].tolist())


@app.route("/api/filter-options")
def get_filter_options():
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
    conn.close()

    return jsonify({
        "regions": row[0] or [],
        "types": row[1] or [],
        "channels": row[2] or [],
        "ases": row[3] or [],
        "zses": row[4] or [],
        "atypes": row[5] or [],
        "user_ids": row[6] or [],
    })


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
        conn.close()
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
    conn.close()
    return jsonify(df_to_payload(df))


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=True)
