#!/usr/bin/env python3
"""
Dynapharm Backend API Server
Simple file-based backend for data synchronization across devices
"""

import json
import os
from datetime import datetime
import socket
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
import threading
import time

# Data storage files
DATA_DIR = "dynapharm_data"
CLIENTS_FILE = os.path.join(DATA_DIR, "clients.json")
USERS_FILE = os.path.join(DATA_DIR, "users.json")
BRANCHES_FILE = os.path.join(DATA_DIR, "branches.json")
REPORTS_FILE = os.path.join(DATA_DIR, "reports.json")

# Create data directory if it doesn't exist
os.makedirs(DATA_DIR, exist_ok=True)

def load_json_file(filename, default=[]):
    """Load JSON data from file, return default if file doesn't exist"""
    try:
        if os.path.exists(filename):
            with open(filename, 'r', encoding='utf-8') as f:
                return json.load(f)
    except Exception as e:
        print(f"Error loading {filename}: {e}")
    return default

def save_json_file(filename, data):
    """Save data to JSON file"""
    try:
        with open(filename, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        return True
    except Exception as e:
        print(f"Error saving {filename}: {e}")
        return False

class DynapharmAPIHandler(BaseHTTPRequestHandler):
    def _set_common_headers(self, content_type='application/json'):
        self.send_header('Content-Type', content_type)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()

    def do_HEAD(self):
        """Minimal HEAD handler for health checks and browsers/tools."""
        parsed_path = urlparse(self.path)
        path = parsed_path.path
        if path == '/api/health':
            self.send_response(200)
        else:
            self.send_response(200)
        self._set_common_headers()

    def do_OPTIONS(self):
        """Handle CORS preflight requests"""
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, HEAD')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_GET(self):
        """Handle GET requests"""
        parsed_path = urlparse(self.path)
        path = parsed_path.path
        
        # Set CORS headers
        self.send_response(200)
        self._set_common_headers('application/json')
        
        try:
            if path == '/api/health':
                data = {"status": "ok", "time": datetime.utcnow().isoformat() + 'Z'}
            elif path == '/api/clients':
                data = load_json_file(CLIENTS_FILE)
            elif path == '/api/users':
                data = load_json_file(USERS_FILE, [
                    {"id":"USR001","username":"admin","password":"admin123","fullName":"Administrator","email":"admin@dynapharm.com.na","phone":"061-300877","role":"admin","branch":"townshop","branches":["townshop"]},
                    {"id":"USR002","username":"consultant","password":"consultant123","fullName":"Dr. John Smith","email":"consultant@dynapharm.com.na","phone":"061-300877","role":"consultant","branch":"townshop","branches":["townshop","khomasdal","hochland-park"]},
                    {"id":"USR003","username":"dispenser","password":"dispenser123","fullName":"Jane Doe","email":"dispenser@dynapharm.com.na","phone":"061-300877","role":"dispenser","branch":"townshop","branches":["townshop"]}
                ])
            elif path == '/api/branches':
                data = load_json_file(BRANCHES_FILE, [
                    {"id":"townshop","name":"TOWNSHOP (Head Office)","location":"Shop No.1 Continental Building Independence Avenue - Windhoek","phone":"814683999"},
                    {"id":"khomasdal","name":"KHOMASDAL DPC","location":"Shop No.2 Khomasdal Funky Town - Windhoek","phone":"814682991"},
                    {"id":"katima","name":"KATIMA DPC","location":"Opposite Open Market Hospital Road, Katima","phone":"817375818"},
                    {"id":"outapi","name":"OUTAPI DPC","location":"Okasilili Location in Christmas Building, Next Tolemeka Garage Main Road Oshakati - Outapi","phone":"814685886"},
                    {"id":"ondangwa","name":"ONDANGWA DPC","location":"Shop No.3 Woerman Block Oluno, Opposite Fresco, Cash and Carry Entrance Ondangwa","phone":"814685882"},
                    {"id":"okongo","name":"OKONGO DPC","location":"Handongo Festus Erf 333 Okongo Village Council","phone":"814684935"},
                    {"id":"okahao","name":"OKAHAO DPC","location":"Iteka complex opposite Pep store Okahao - Oshakati main road","phone":"814683963"},
                    {"id":"nkurenkuru","name":"NKURENKURU DPC","location":"Total Service Station, Next to Oluno Bar - Nkurenkuru","phone":"814684939"},
                    {"id":"swakopmund","name":"SWAKOPMUND DPC","location":"Opposite Mondesa Usave Swakopmund","phone":"814686806"},
                    {"id":"hochland-park","name":"HOCHLAND PARK","location":"House No.2 Robin Road, Taubern Glain Street, Next to OK Food Windhoek","phone":"813207195"},
                    {"id":"rundu","name":"RUNDU DPC","location":"Shop No.6 Fish Building opposite, Dr. Romanus Kampungi Stadium","phone":"814050125"},
                    {"id":"gobabis","name":"GOBABIS","location":"Shop No. Church Street Woerman Complex Gobabis","phone":"814685905"},
                    {"id":"walvisbay","name":"WALVISBAY","location":"Shop No.6 Pelican Mall Shop Sam Nujoma Avenue","phone":"814685894"},
                    {"id":"eenhana","name":"EENHANA","location":"Shop No.3 Tangi Complex, Next to Namibia Funeral Supply, Dimo Amaambo Street Eenhana","phone":"814682049"},
                    {"id":"otjiwarongo","name":"OTJIWARONGO DPC","location":"Erindi Complex next to Spar","phone":"814681997"}
                ])
            elif path == '/api/reports':
                data = load_json_file(REPORTS_FILE)
                # Filter out client data that might have been mixed in
                data = [item for item in data if 'id' in item and item.get('id', '').startswith('RPT')]
            else:
                data = {"error": "Endpoint not found"}
            
            self.wfile.write(json.dumps(data).encode('utf-8'))
        except Exception as e:
            error_response = {"error": str(e)}
            self.wfile.write(json.dumps(error_response).encode('utf-8'))

    def do_POST(self):
        """Handle POST requests"""
        content_length = int(self.headers['Content-Length'])
        post_data = self.rfile.read(content_length)
        
        # Set CORS headers
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        
        try:
            data = json.loads(post_data.decode('utf-8'))
            parsed_path = urlparse(self.path)
            path = parsed_path.path
            
            if path == '/api/clients':
                clients = load_json_file(CLIENTS_FILE)
                clients.append(data)
                save_json_file(CLIENTS_FILE, clients)
                response = {"success": True, "message": "Client saved"}
                
            elif path == '/api/users':
                users = load_json_file(USERS_FILE, [
                    {"id":"USR001","username":"admin","password":"admin123","fullName":"Administrator","email":"admin@dynapharm.com.na","phone":"061-300877","role":"admin","branch":"townshop","branches":["townshop"]},
                    {"id":"USR002","username":"consultant","password":"consultant123","fullName":"Dr. John Smith","email":"consultant@dynapharm.com.na","phone":"061-300877","role":"consultant","branch":"townshop","branches":["townshop","khomasdal","hochland-park"]},
                    {"id":"USR003","username":"dispenser","password":"dispenser123","fullName":"Jane Doe","email":"dispenser@dynapharm.com.na","phone":"061-300877","role":"dispenser","branch":"townshop","branches":["townshop"]}
                ])
                users.append(data)
                save_json_file(USERS_FILE, users)
                response = {"success": True, "message": "User saved"}
                
            elif path == '/api/branches':
                branches = load_json_file(BRANCHES_FILE, [
                    {"id":"townshop","name":"TOWNSHOP (Head Office)","location":"Shop No.1 Continental Building Independence Avenue - Windhoek","phone":"814683999"},
                    {"id":"khomasdal","name":"KHOMASDAL DPC","location":"Shop No.2 Khomasdal Funky Town - Windhoek","phone":"814682991"},
                    {"id":"katima","name":"KATIMA DPC","location":"Opposite Open Market Hospital Road, Katima","phone":"817375818"},
                    {"id":"outapi","name":"OUTAPI DPC","location":"Okasilili Location in Christmas Building, Next Tolemeka Garage Main Road Oshakati - Outapi","phone":"814685886"},
                    {"id":"ondangwa","name":"ONDANGWA DPC","location":"Shop No.3 Woerman Block Oluno, Opposite Fresco, Cash and Carry Entrance Ondangwa","phone":"814685882"},
                    {"id":"okongo","name":"OKONGO DPC","location":"Handongo Festus Erf 333 Okongo Village Council","phone":"814684935"},
                    {"id":"okahao","name":"OKAHAO DPC","location":"Iteka complex opposite Pep store Okahao - Oshakati main road","phone":"814683963"},
                    {"id":"nkurenkuru","name":"NKURENKURU DPC","location":"Total Service Station, Next to Oluno Bar - Nkurenkuru","phone":"814684939"},
                    {"id":"swakopmund","name":"SWAKOPMUND DPC","location":"Opposite Mondesa Usave Swakopmund","phone":"814686806"},
                    {"id":"hochland-park","name":"HOCHLAND PARK","location":"House No.2 Robin Road, Taubern Glain Street, Next to OK Food Windhoek","phone":"813207195"},
                    {"id":"rundu","name":"RUNDU DPC","location":"Shop No.6 Fish Building opposite, Dr. Romanus Kampungi Stadium","phone":"814050125"},
                    {"id":"gobabis","name":"GOBABIS","location":"Shop No. Church Street Woerman Complex Gobabis","phone":"814685905"},
                    {"id":"walvisbay","name":"WALVISBAY","location":"Shop No.6 Pelican Mall Shop Sam Nujoma Avenue","phone":"814685894"},
                    {"id":"eenhana","name":"EENHANA","location":"Shop No.3 Tangi Complex, Next to Namibia Funeral Supply, Dimo Amaambo Street Eenhana","phone":"814682049"},
                    {"id":"otjiwarongo","name":"OTJIWARONGO DPC","location":"Erindi Complex next to Spar","phone":"814681997"}
                ])
                branches.append(data)
                save_json_file(BRANCHES_FILE, branches)
                response = {"success": True, "message": "Branch saved"}
                
            elif path == '/api/reports':
                reports = load_json_file(REPORTS_FILE)
                # Filter out client data that might have been mixed in
                reports = [item for item in reports if 'id' in item and item.get('id', '').startswith('RPT')]
                reports.append(data)
                save_json_file(REPORTS_FILE, reports)
                response = {"success": True, "message": "Report saved"}
                
            else:
                response = {"error": "Endpoint not found"}
            
            self.wfile.write(json.dumps(response).encode('utf-8'))
        except Exception as e:
            error_response = {"error": str(e)}
            self.wfile.write(json.dumps(error_response).encode('utf-8'))

    def do_PUT(self):
        """Handle PUT requests for updates"""
        content_length = int(self.headers['Content-Length'])
        post_data = self.rfile.read(content_length)
        
        # Set CORS headers
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        
        try:
            data = json.loads(post_data.decode('utf-8'))
            parsed_path = urlparse(self.path)
            path = parsed_path.path
            
            if path == '/api/users':
                users = load_json_file(USERS_FILE, [
                    {"id":"USR001","username":"admin","password":"admin123","fullName":"Administrator","email":"admin@dynapharm.com.na","phone":"061-300877","role":"admin","branch":"townshop","branches":["townshop"]},
                    {"id":"USR002","username":"consultant","password":"consultant123","fullName":"Dr. John Smith","email":"consultant@dynapharm.com.na","phone":"061-300877","role":"consultant","branch":"townshop","branches":["townshop","khomasdal","hochland-park"]},
                    {"id":"USR003","username":"dispenser","password":"dispenser123","fullName":"Jane Doe","email":"dispenser@dynapharm.com.na","phone":"061-300877","role":"dispenser","branch":"townshop","branches":["townshop"]}
                ])
                # Update user
                for i, user in enumerate(users):
                    if user['id'] == data['id']:
                        users[i] = data
                        break
                save_json_file(USERS_FILE, users)
                response = {"success": True, "message": "User updated"}
                
            elif path == '/api/clients':
                clients = load_json_file(CLIENTS_FILE)
                # Update client
                client_found = False
                for i, client in enumerate(clients):
                    if client.get('referenceNumber') == data.get('referenceNumber'):
                        clients[i] = data
                        client_found = True
                        break
                
                if client_found:
                    save_json_file(CLIENTS_FILE, clients)
                    response = {"success": True, "message": "Client updated"}
                else:
                    response = {"error": "Client not found"}
                
            elif path == '/api/reports':
                reports = load_json_file(REPORTS_FILE)
                # Filter out client data that might have been mixed in
                reports = [item for item in reports if 'id' in item and item.get('id', '').startswith('RPT')]
                # Update report
                report_found = False
                for i, report in enumerate(reports):
                    if report.get('id') == data.get('id'):
                        reports[i] = data
                        report_found = True
                        break
                
                if report_found:
                    save_json_file(REPORTS_FILE, reports)
                    response = {"success": True, "message": "Report updated"}
                else:
                    response = {"error": "Report not found"}
                
            else:
                response = {"error": "Endpoint not found"}
            
            self.wfile.write(json.dumps(response).encode('utf-8'))
        except Exception as e:
            error_response = {"error": str(e)}
            self.wfile.write(json.dumps(error_response).encode('utf-8'))

    def do_DELETE(self):
        """Handle DELETE requests"""
        parsed_path = urlparse(self.path)
        path = parsed_path.path
        query_params = parse_qs(parsed_path.query)
        
        # Set CORS headers
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        
        try:
            if path == '/api/users' and 'id' in query_params:
                user_id = query_params['id'][0]
                users = load_json_file(USERS_FILE, [
                    {"id":"USR001","username":"admin","password":"admin123","fullName":"Administrator","email":"admin@dynapharm.com.na","phone":"061-300877","role":"admin","branch":"townshop","branches":["townshop"]},
                    {"id":"USR002","username":"consultant","password":"consultant123","fullName":"Dr. John Smith","email":"consultant@dynapharm.com.na","phone":"061-300877","role":"consultant","branch":"townshop","branches":["townshop","khomasdal","hochland-park"]},
                    {"id":"USR003","username":"dispenser","password":"dispenser123","fullName":"Jane Doe","email":"dispenser@dynapharm.com.na","phone":"061-300877","role":"dispenser","branch":"townshop","branches":["townshop"]}
                ])
                users = [u for u in users if u['id'] != user_id]
                save_json_file(USERS_FILE, users)
                response = {"success": True, "message": "User deleted"}
                
            elif path == '/api/branches' and 'id' in query_params:
                branch_id = query_params['id'][0]
                branches = load_json_file(BRANCHES_FILE, [
                    {"id":"townshop","name":"TOWNSHOP (Head Office)","location":"Shop No.1 Continental Building Independence Avenue - Windhoek","phone":"814683999"},
                    {"id":"khomasdal","name":"KHOMASDAL DPC","location":"Shop No.2 Khomasdal Funky Town - Windhoek","phone":"814682991"},
                    {"id":"katima","name":"KATIMA DPC","location":"Opposite Open Market Hospital Road, Katima","phone":"817375818"},
                    {"id":"outapi","name":"OUTAPI DPC","location":"Okasilili Location in Christmas Building, Next Tolemeka Garage Main Road Oshakati - Outapi","phone":"814685886"},
                    {"id":"ondangwa","name":"ONDANGWA DPC","location":"Shop No.3 Woerman Block Oluno, Opposite Fresco, Cash and Carry Entrance Ondangwa","phone":"814685882"},
                    {"id":"okongo","name":"OKONGO DPC","location":"Handongo Festus Erf 333 Okongo Village Council","phone":"814684935"},
                    {"id":"okahao","name":"OKAHAO DPC","location":"Iteka complex opposite Pep store Okahao - Oshakati main road","phone":"814683963"},
                    {"id":"nkurenkuru","name":"NKURENKURU DPC","location":"Total Service Station, Next to Oluno Bar - Nkurenkuru","phone":"814684939"},
                    {"id":"swakopmund","name":"SWAKOPMUND DPC","location":"Opposite Mondesa Usave Swakopmund","phone":"814686806"},
                    {"id":"hochland-park","name":"HOCHLAND PARK","location":"House No.2 Robin Road, Taubern Glain Street, Next to OK Food Windhoek","phone":"813207195"},
                    {"id":"rundu","name":"RUNDU DPC","location":"Shop No.6 Fish Building opposite, Dr. Romanus Kampungi Stadium","phone":"814050125"},
                    {"id":"gobabis","name":"GOBABIS","location":"Shop No. Church Street Woerman Complex Gobabis","phone":"814685905"},
                    {"id":"walvisbay","name":"WALVISBAY","location":"Shop No.6 Pelican Mall Shop Sam Nujoma Avenue","phone":"814685894"},
                    {"id":"eenhana","name":"EENHANA","location":"Shop No.3 Tangi Complex, Next to Namibia Funeral Supply, Dimo Amaambo Street Eenhana","phone":"814682049"},
                    {"id":"otjiwarongo","name":"OTJIWARONGO DPC","location":"Erindi Complex next to Spar","phone":"814681997"}
                ])
                branches = [b for b in branches if b['id'] != branch_id]
                save_json_file(BRANCHES_FILE, branches)
                response = {"success": True, "message": "Branch deleted"}
                
            else:
                response = {"error": "Endpoint not found"}
            
            self.wfile.write(json.dumps(response).encode('utf-8'))
        except Exception as e:
            error_response = {"error": str(e)}
            self.wfile.write(json.dumps(error_response).encode('utf-8'))

    def log_message(self, format, *args):
        """Override to reduce log noise"""
        pass

def _detect_ip() -> str:
    """Best-effort detection of the primary local IP for display/logging."""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            # Doesn't need to be reachable; no packets sent
            s.connect(("8.8.8.8", 80))
            return s.getsockname()[0]
    except Exception:
        return 'localhost'

def start_backend_server(port=None):
    """Start the backend API server"""
    # Use PORT environment variable for Railway/Heroku deployment
    if port is None:
        port = int(os.environ.get('PORT', 8001))
    
    server_address = ('', port)
    httpd = HTTPServer(server_address, DynapharmAPIHandler)
    ip = _detect_ip()
    print(f"🚀 Dynapharm Backend API Server running on port {port}")
    print(f"📡 API Base URL: http://localhost:{port}/api")
    print(f"🌐 Network URL: http://{ip}:{port}/api")
    print("📊 Available endpoints:")
    print("   GET  /api/clients   - Get all clients")
    print("   POST /api/clients   - Add new client")
    print("   GET  /api/users     - Get all users")
    print("   POST /api/users     - Add new user")
    print("   PUT  /api/users     - Update user")
    print("   DELETE /api/users   - Delete user")
    print("   GET  /api/branches  - Get all branches")
    print("   POST /api/branches  - Add new branch")
    print("   DELETE /api/branches - Delete branch")
    print("   GET  /api/reports   - Get all reports")
    print("   POST /api/reports   - Add new report")
    print("   PUT  /api/reports   - Update report")
    print("   GET  /api/health    - Health check")
    print("\n🔄 Data is now synchronized across all devices!")
    print("⏹️  Press Ctrl+C to stop the server")
    
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n🛑 Server stopped")
        httpd.server_close()

if __name__ == "__main__":
    start_backend_server()
