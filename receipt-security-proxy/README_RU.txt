ЗАЩИТА ЧЕКОВОЙ ПРОГРАММЫ

1. Чековая программа остаётся на http://127.0.0.1:8000/order.
2. Сгенерируйте длинный RECEIPT_SECRET (минимум 32 случайных символа).
3. В Railway BOT добавьте точно такой же RECEIPT_SECRET.
4. На Windows перед запуском proxy:

   set RECEIPT_SECRET=ВАШ_ДЛИННЫЙ_СЕКРЕТ
   set UPSTREAM_RECEIPT_URL=http://127.0.0.1:8000
   python secure_receipt_proxy.py

5. Proxy слушает http://127.0.0.1:8002/order.
6. Cloudflare Tunnel должен вести публичный домен на http://127.0.0.1:8002,
   а НЕ на порт 8000.
7. PRINT_URL в Railway BOT остаётся публичным URL туннеля, например:
   https://orders.example.com/order

Запрос без X-Receipt-Secret получит 401 и до чековой программы не дойдёт.
