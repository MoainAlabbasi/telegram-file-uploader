import os
from flask import Flask, send_from_directory, jsonify, request

# Initialize Flask App serving the 'public' folder
app = Flask(__name__, static_folder='public', static_url_path='')

# 1. Route to Serve the Main Interface
@app.route('/')
def home():
    return send_from_directory('public', 'index.html')

# 2. Route to Serve Static Files (HTML, JS, CSS in public)
@app.route('/<path:path>')
def serve_static(path):
    # This route handles all files in the public folder
    if os.path.exists(os.path.join('public', path)):
        return send_from_directory('public', path)
    return f"File {path} not found", 404

# 3. API Placeholder (To prevent 404s on frontend calls)
# NOTE: The actual logic for these endpoints needs to be ported from the old server.js
# For now, we ensure the routes exist to prevent frontend crashes.

@app.route('/api/files', methods=['GET'])
def handle_files():
    # Placeholder for fetching file list
    return jsonify({"status": "success", "files": []})

@app.route('/api/quizzes', methods=['GET', 'POST'])
def handle_quizzes():
    # Placeholder for quiz list/creation
    return jsonify({"status": "success", "quizzes": []})

@app.route('/api/convert/<type>/<id>/<format>', methods=['GET'])
def handle_convert(type, id, format):
    # Placeholder for conversion endpoint
    return jsonify({"status": "error", "message": "Conversion logic not yet ported to Python"})

@app.route('/health')
def health():
    return "OK", 200

# 5. MAIN ENTRY POINT
if __name__ == "__main__":
    # CRITICAL: Must listen on 0.0.0.0 and get PORT from env
    port = int(os.environ.get("PORT", 5000))
    print(f"Server starting on port {port}...")
    # Use gunicorn for production, but Flask's built-in server for local testing
    app.run(host='0.0.0.0', port=port)
