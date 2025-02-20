from flask import Flask, render_template, request

app = Flask(__name__)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/dashboard')
def dashboard():
    return render_template('dashboard.html')

@app.route('/payment')
def payment():
    return render_template('pincode.html')

@app.route('/pincode')
def pincode():
    return render_template('pincode.html')

if __name__ == '__main__':
    app.run(debug=True) 