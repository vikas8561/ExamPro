# Quick Production Setup Guide

## 🚀 Fastest Way to Deploy

### Step 1: Deploy Python Service on Render (5 minutes)

1. **Go to Render Dashboard:** https://dashboard.render.com
2. **Click "New +" → "Web Service"**
3. **Connect your GitHub repository**
4. **Configure:**
   - **Name:** `face-recognition-service`
   - **Root Directory:** `FaceRecognitionService`
   - **Environment:** `Python 3`
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `python app.py`
   - **Plan:** Choose **Starter** (512MB) or **Standard** (2GB recommended)

5. **Click "Create Web Service"**
6. **Wait for deployment** (5-10 minutes - first time downloads models)

7. **Copy your service URL** (e.g., `https://face-recognition-service-xxxx.onrender.com`)

### Step 2: Update Backend Environment Variables (2 minutes)

1. **Go to Render Dashboard → Your Backend Service → Environment**
2. **Add/Update:**
   ```
   FACE_RECOGNITION_SERVICE_URL=https://your-service-url.onrender.com
   FACE_RECOGNITION_FALLBACK=false
   ```
3. **Click "Save Changes"** (service will auto-redeploy)

### Step 3: Test (1 minute)

1. **Test health endpoint:**
   ```bash
   curl https://your-service-url.onrender.com/health
   ```
   Should return: `{"status":"healthy",...}`

2. **Test in your app:**
   - Upload profile image
   - Try face verification
   - Should work! ✅

## ⚠️ Important Notes

### Free Tier Limitations:
- **Service sleeps after 15 min** → First request after sleep takes 30-60 seconds
- **512MB RAM** → Might be tight for DeepFace (upgrade to Standard for 2GB)

### Paid Tier Benefits:
- **Always running** → No cold starts
- **2GB+ RAM** → Better performance
- **Faster response times**

## 🔧 Alternative: Railway (Easier, No Sleep)

1. Go to https://railway.app
2. New Project → Deploy from GitHub
3. Select `FaceRecognitionService` folder
4. Railway auto-detects everything!
5. Get URL and update backend

**Railway Free Tier:** No sleep, but limited hours/month

## 📋 Checklist

- [ ] Python service deployed
- [ ] Service URL copied
- [ ] Backend environment variables updated
- [ ] Health endpoint tested
- [ ] Face verification tested in production
- [ ] Error messages verified

## 🆘 Troubleshooting

**Service won't start?**
- Check Render logs
- Verify `requirements.txt` is correct
- Check Python version (3.9+)

**Timeout errors?**
- Service is sleeping (free tier)
- Wait 30-60 seconds for first request
- Or upgrade to paid plan

**Out of memory?**
- Upgrade to Standard plan (2GB RAM)
- Or use Railway/Fly.io

**Model download slow?**
- Normal on first request (2-5 minutes)
- Model is cached after that

## 💡 Pro Tips

1. **Warm up service after deployment:**
   ```bash
   curl https://your-service.onrender.com/health
   ```

2. **Monitor logs** in Render dashboard

3. **Set up alerts** for service downtime

4. **Consider keep-alive** if using free tier (ping every 10 min)

---

**That's it!** Your face recognition system is now in production! 🎉

