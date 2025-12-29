# Mobile Access Guide

This guide will help you access your localhost development server from your mobile device.

## Steps to Access from Mobile

### 1. Find Your Computer's IP Address

**Windows:**
```bash
ipconfig
```
Look for "IPv4 Address" under your active network adapter (usually starts with 192.168.x.x or 10.x.x.x)

**Mac/Linux:**
```bash
ifconfig
# or
ip addr
```
Look for "inet" address under your active network interface (usually starts with 192.168.x.x or 10.x.x.x)

### 2. Start the Servers

**Backend Server:**
```bash
cd Backend
npm run dev
```
The server will start on `http://0.0.0.0:4000` (accessible from network)

**Frontend Server:**
```bash
cd Frontend
npm run dev
```
The frontend will start on `http://0.0.0.0:5173` (accessible from network)

### 3. Access from Mobile Device

1. **Make sure your mobile device is on the same Wi-Fi network** as your computer

2. **Open your mobile browser** and navigate to:
   ```
   http://YOUR_IP_ADDRESS:5173
   ```
   Replace `YOUR_IP_ADDRESS` with the IP address you found in step 1.
   
   Example: If your IP is `192.168.1.100`, use:
   ```
   http://192.168.1.100:5173
   ```

### 4. Troubleshooting

**If you can't connect:**
- ✅ Make sure both devices are on the same Wi-Fi network
- ✅ Check Windows Firewall - it may be blocking connections
- ✅ Check your router settings - some routers block device-to-device communication
- ✅ Try disabling VPN if you're using one
- ✅ Make sure the servers are running and showing the network access messages

**Windows Firewall Fix:**
1. Open Windows Defender Firewall
2. Click "Allow an app or feature through Windows Defender Firewall"
3. Add Node.js and allow both Private and Public networks

**If API calls fail:**
- The frontend will automatically use your computer's IP address for API calls
- Make sure the backend server is accessible on port 4000
- Check the browser console for any CORS errors

### 5. Quick Test

After starting both servers, you should see:
- Backend: `Server running on http://localhost:4000`
- Frontend: `Local: http://localhost:5173/` and `Network: http://YOUR_IP:5173/`

Use the Network URL on your mobile device!

