const socket = io();
const username = '{{ username }}';
let activeUsers = [];
let privateChats = {};
let unreadMessages = {};
let currentGroup = null;

socket.on('connect', () => {
    console.log('Connected to server');
});

socket.on('update_users', (users) => {
    activeUsers = users;
    updateUserList();
});

socket.on('load_messages', (messages) => {
    messages.forEach(displayMessage);
});

socket.on('new_message', (message) => {
    displayMessage(message);
});

socket.on('new_private_message', (message) => {
    if (!privateChats[message.user]) {
        createPrivateChatWindow(message.user);
    }
    displayPrivateMessage(message.user, message);
    updateUnreadCount(message.user);
    showNotification(`New message from ${message.user}`);
});

socket.on('update_unread', (unread) => {
    unreadMessages = unread;
    updateUnreadCount();
});

socket.on('update_groups', (groups) => {
    updateGroupList(groups);
});

socket.on('new_group_message', (data) => {
    if (currentGroup === data.group) {
        displayMessage(data.message);
    }
    showNotification(`New message in group ${data.group}`);
});

function updateUserList() {
    const userList = document.getElementById('user-list');
    userList.innerHTML = '';
    activeUsers.forEach(user => {
        if (user.name !== username) {
            const li = document.createElement('li');
            li.innerHTML = `${user.name} ${getGenderEmoji(user.gender)}`;
            li.onclick = () => createPrivateChatWindow(user.name);
            userList.appendChild(li);
        }
    });
}

function getGenderEmoji(gender) {
    switch (gender.toLowerCase()) {
        case 'male':
            return '👨';
        case 'female':
            return '👩';
        default:
            return '🧑';
    }
}

function displayMessage(message) {
    const chatMessages = document.getElementById('chat-messages');
    const messageElement = document.createElement('div');
    messageElement.classList.add('message', message.user === username ? 'sent' : 'received');
    
    if (message.type === 'text' || message.type === 'group') {
        messageElement.textContent = `${message.user}: ${message.text}`;
    } else if (message.type === 'image') {
        const img = document.createElement('img');
        img.src = message.image_url;
        messageElement.appendChild(img);
    }
    
    chatMessages.appendChild(messageElement);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function createPrivateChatWindow(recipient) {
    if (privateChats[recipient]) return;

    const privateChatContainer = document.getElementById('private-chat-container');
    const chatWindow = document.createElement('div');
    chatWindow.classList.add('private-chat-window');
    chatWindow.innerHTML = `
        <div class="private-chat-header">
            <span>${recipient}</span>
            <button onclick="closePrivateChat('${recipient}')">Close</button>
        </div>
        <div class="private-chat-messages" id="private-chat-messages-${recipient}"></div>
        <div class="private-chat-input">
            <input type="text" id="private-message-input-${recipient}" placeholder="Type a message...">
            <button onclick="sendPrivateMessage('${recipient}')">Send</button>
        </div>
    `;
    privateChatContainer.appendChild(chatWindow);
    privateChats[recipient] = chatWindow;
    
    const input = document.getElementById(`private-message-input-${recipient}`);
    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            sendPrivateMessage(recipient);
        }
    });

    socket.emit('mark_as_read', { sender: recipient });
}

function closePrivateChat(recipient) {
    const chatWindow = privateChats[recipient];
    if (chatWindow) {
        chatWindow.remove();
        delete privateChats[recipient];
    }
}

function sendPrivateMessage(recipient) {
    const input = document.getElementById(`private-message-input-${recipient}`);
    const message = input.value.trim();
    if (message) {
        socket.emit('private_message', { recipient, message });
        displayPrivateMessage(recipient, { user: username, text: message, type: 'private' });
        input.value = '';
    }
}

function displayPrivateMessage(recipient, message) {
    const chatMessages = document.getElementById(`private-chat-messages-${recipient}`);
    const messageElement = document.createElement('div');
    messageElement.classList.add('message', message.user === username ? 'sent' : 'received');
    messageElement.textContent = `${message.user}: ${message.text}`;
    
    if (message.user === username) {
        const readStatus = document.createElement('span');
        readStatus.classList.add('read-status');
        readStatus.innerHTML = message.read ? '✓✓' : '✓';
        messageElement.appendChild(readStatus);
    }
    
    chatMessages.appendChild(messageElement);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function updateUnreadCount() {
    const unreadCount = document.getElementById('unread-count');
    const totalUnread = Object.values(unreadMessages).reduce((sum, count) => sum + count, 0);
    unreadCount.textContent = totalUnread > 0 ? totalUnread : '';
    updateInboxList();
}

function updateInboxList() {
    const inboxList = document.getElementById('inbox-list');
    inboxList.innerHTML = '';
    for (const [sender, count] of Object.entries(unreadMessages)) {
        const li = document.createElement('li');
        li.textContent = `${sender} (${count})`;
        li.onclick = () => {
            createPrivateChatWindow(sender);
            closeInboxModal();
        };
        inboxList.appendChild(li);
    }
}

function updateGroupList(groups) {
    const groupList = document.getElementById('group-list');
    groupList.innerHTML = '';
    groups.forEach(group => {
        const li = document.createElement('li');
        li.textContent = group;
        li.onclick = () => joinGroup(group);
        groupList.appendChild(li);
    });
}

function joinGroup(groupName) {
    socket.emit('join_group', { group_name: groupName });
    currentGroup = groupName;
    // Clear chat messages and load group messages
    document.getElementById('chat-messages').innerHTML = '';
    // You might want to emit an event to get group messages here
}

document.getElementById('send-btn').addEventListener('click', sendMessage);
document.getElementById('message-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        sendMessage();
    }
});

function sendMessage() {
    const input = document.getElementById('message-input');
    const message = input.value.trim();
    if (message) {
        if (currentGroup) {
            socket.emit('group_message', { group: currentGroup, message: message });
        } else {
            socket.emit('send_message', { message });
        }
        input.value = '';
    }
}

document.getElementById('upload-btn').addEventListener('click', () => {
    document.getElementById('image-upload').click();
});

document.getElementById('image-upload').addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            socket.emit('send_image', { image: e.target.result });
        };
        reader.readAsDataURL(file);
    }
});

function showNotification(message) {
    const notification = document.createElement('div');
    notification.classList.add('notification');
    notification.textContent = message;
    document.body.appendChild(notification);
    notification.style.display = 'block';
    setTimeout(() => {
        notification.style.display = 'none';
        notification.remove();
    }, 3000);
}

document.getElementById('toggle-sidebar').addEventListener('click', () => {
    document.querySelector('.sidebar').classList.toggle('hidden');
});

const inboxIcon = document.querySelector('.inbox');
const profileIcon = document.querySelector('.profile');
const inboxModal = document.getElementById('inbox-modal');
const profileModal = document.getElementById('profile-modal');
const createGroupModal = document.getElementById('create-group-modal');
const closeBtns = document.querySelectorAll('.close');

inboxIcon.onclick = () => {
    inboxModal.style.display = 'block';
    updateInboxList();
};

profileIcon.onclick = () => {
    profileModal.style.display = 'block';
    document.getElementById('profile-details').textContent = `Name: ${username}, Age: ${activeUsers.find(u => u.name === username).age}, Gender: ${activeUsers.find(u => u.name === username).gender}`;
};

document.getElementById('create-group-btn').onclick = () => {
    createGroupModal.style.display = 'block';
};

closeBtns.forEach(btn => {
    btn.onclick = function() {
        this.closest('.modal').style.display = 'none';
    };
});

window.onclick = (event) => {
    if (event.target.classList.contains('modal')) {
        event.target.style.display = 'none';
    }
};

document.getElementById('create-group-submit').addEventListener('click', () => {
    const groupName = document.getElementById('group-name-input').value.trim();
    if (groupName) {
        socket.emit('create_group', { group_name: groupName });
        createGroupModal.style.display = 'none';
    }
});