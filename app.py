from flask import Flask, render_template, request, session, redirect, url_for, jsonify
from flask_socketio import SocketIO, emit, join_room, leave_room
import os
from dotenv import load_dotenv
import base64
import time
import logging

load_dotenv()

app = Flask(__name__)
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'your-secret-key')
socketio = SocketIO(app, cors_allowed_origins="*")

users = {}
messages = []
unread_messages = {}
groups = {}

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@app.route('/')
def index():
    if 'user' not in session:
        return redirect(url_for('login'))
    return render_template('chat.html', username=session['user']['name'])

@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        name = request.form['name']
        age = request.form['age']
        gender = request.form['gender']
        session['user'] = {'name': name, 'age': age, 'gender': gender}
        logger.info(f"User logged in: {session['user']}")
        return redirect(url_for('index'))
    return render_template('login.html')

@app.route('/logout')
def logout():
    logger.info(f"User logged out: {session.get('user', 'Unknown')}")
    session.pop('user', None)
    return redirect(url_for('login'))

@socketio.on('connect')
def handle_connect():
    if 'user' in session:
        users[request.sid] = session['user']
        emit('update_users', list(users.values()), broadcast=True)
        emit('load_messages', messages)
        emit('update_groups', list(groups.keys()))
        if session['user']['name'] in unread_messages:
            emit('unread_messages', unread_messages[session['user']['name']])

@socketio.on('disconnect')
def handle_disconnect():
    if request.sid in users:
        del users[request.sid]
        emit('update_users', list(users.values()), broadcast=True)

@socketio.on('send_message')
def handle_message(data):
    message = {
        'user': session['user']['name'],
        'text': data['message'],
        'type': 'text',
        'timestamp': time.time()
    }
    messages.append(message)
    emit('new_message', message, broadcast=True)
    logger.info(f"Public message: {session['user']['name']} - {data['message']}")

@socketio.on('send_image')
def handle_image(data):
    image_data = base64.b64decode(data['image'].split(',')[1])
    filename = f"image_{int(time.time())}.png"
    with open(os.path.join('static', 'uploads', filename), 'wb') as f:
        f.write(image_data)
    
    message = {
        'user': session['user']['name'],
        'image_url': f'/static/uploads/{filename}',
        'type': 'image',
        'timestamp': time.time()
    }
    messages.append(message)
    emit('new_message', message, broadcast=True)
    logger.info(f"Image sent by: {session['user']['name']}")

@socketio.on('private_message')
def handle_private_message(data):
    recipient = data['recipient']
    message = {
        'user': session['user']['name'],
        'text': data['message'],
        'type': 'private',
        'timestamp': time.time(),
        'read': False
    }
    recipient_sid = next((sid for sid, user in users.items() if user['name'] == recipient), None)
    if recipient_sid:
        emit('new_private_message', message, room=recipient_sid)
        emit('new_private_message', message, room=request.sid)
        if recipient not in unread_messages:
            unread_messages[recipient] = {}
        if session['user']['name'] not in unread_messages[recipient]:
            unread_messages[recipient][session['user']['name']] = 0
        unread_messages[recipient][session['user']['name']] += 1
        emit('update_unread', unread_messages[recipient], room=recipient_sid)
    else:
        if recipient not in unread_messages:
            unread_messages[recipient] = {}
        if session['user']['name'] not in unread_messages[recipient]:
            unread_messages[recipient][session['user']['name']] = 0
        unread_messages[recipient][session['user']['name']] += 1
    logger.info(f"Private message: {session['user']['name']} to {recipient} - {data['message']}")

@socketio.on('mark_as_read')
def mark_as_read(data):
    sender = data['sender']
    if session['user']['name'] in unread_messages and sender in unread_messages[session['user']['name']]:
        del unread_messages[session['user']['name']][sender]
        emit('update_unread', unread_messages[session['user']['name']])

@socketio.on('create_group')
def create_group(data):
    group_name = data['group_name']
    if group_name not in groups:
        groups[group_name] = {'members': [session['user']['name']], 'messages': []}
        emit('update_groups', list(groups.keys()), broadcast=True)
        logger.info(f"Group created: {group_name} by {session['user']['name']}")

@socketio.on('join_group')
def join_group(data):
    group_name = data['group_name']
    if group_name in groups and session['user']['name'] not in groups[group_name]['members']:
        groups[group_name]['members'].append(session['user']['name'])
        emit('update_group_members', {'group': group_name, 'members': groups[group_name]['members']}, broadcast=True)
        logger.info(f"{session['user']['name']} joined group: {group_name}")

@socketio.on('group_message')
def group_message(data):
    group_name = data['group']
    message = {
        'user': session['user']['name'],
        'text': data['message'],
        'type': 'group',
        'timestamp': time.time()
    }
    if group_name in groups:
        groups[group_name]['messages'].append(message)
        emit('new_group_message', {'group': group_name, 'message': message}, room=group_name)
        logger.info(f"Group message in {group_name}: {session['user']['name']} - {data['message']}")

if __name__ == '__main__':
    if not os.path.exists('static/uploads'):
        os.makedirs('static/uploads')
    socketio.run(app, debug=True)