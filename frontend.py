import streamlit as st
import requests
import time
from datetime import datetime

# Page configuration
st.set_page_config(
    page_title="FNA Terminal",
    page_icon="📊",
    layout="wide",
    initial_sidebar_state="expanded"
)

# Custom CSS for Bloomberg-style dark theme
st.markdown("""
<style>
    .stApp {
        background-color: #0E1117;
        color: #FFFFFF;
    }
    .main-header {
        font-family: 'Courier New', monospace;
        color: #00FF9F;
        font-size: 28px;
        font-weight: bold;
    }
    .market-ticker {
        font-family: 'Courier New', monospace;
        background-color: #1E252F;
        padding: 8px;
        border-radius: 4px;
        font-size: 14px;
    }
    .input-box, .result-box {
        background-color: #1E252F;
        border: 1px solid #3A424F;
        border-radius: 4px;
        padding: 12px;
        font-family: 'Courier New', monospace;
    }
    .analyze-btn {
        background-color: #FF9500;
        color: black;
        font-weight: bold;
    }
    .login-container {
        max-width: 400px;
        margin: 100px auto;
        padding: 40px;
        background-color: #1E252F;
        border: 1px solid #3A424F;
        border-radius: 8px;
    }
</style>
""", unsafe_allow_html=True)

# Session state initialization
if 'logged_in' not in st.session_state:
    st.session_state.logged_in = False
if 'jwt_token' not in st.session_state:
    st.session_state.jwt_token = None
if 'analysis_result' not in st.session_state:
    st.session_state.analysis_result = ""

# Mock market data
market_data = {
    "S&P 500": "5,847.12 +0.42%",
    "NASDAQ": "20,431.05 +0.81%",
    "DOW": "44,201.67 -0.12%",
    "BTC": "$108,432 +1.92%",
    "GOLD": "$2,712.40 +0.51%"
}

def login_page():
    st.markdown("<h1 class='main-header' style='text-align: center;'>FNA.TERMINAL</h1>", unsafe_allow_html=True)
    st.markdown("<p style='text-align: center; color: #AAAAAA;'>FINANCIAL NEWS ANALYST • DESK EDITION</p>", unsafe_allow_html=True)
    
    st.markdown('<div class="login-container">', unsafe_allow_html=True)
    
    st.subheader("Access the desk")
    st.caption("Authenticate to deploy the financial news analyst.")
    
    email = st.text_input("EMAIL", value="analyst@desk.fna", disabled=True)
    password = st.text_input("PASSWORD", type="password", value="demo1234")
    
    if st.button("ENTER TERMINAL →", type="primary", use_container_width=True):
        # Mock JWT login
        with st.spinner("Authenticating..."):
            time.sleep(1.2)
            st.session_state.jwt_token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.mock-jwt-token-12345"
            st.session_state.logged_in = True
            st.rerun()
    
    st.caption("DEMO // any email + password ≥ 4 chars")
    st.markdown('</div>', unsafe_allow_html=True)

def main_terminal():
    # Top bar
    col1, col2, col3 = st.columns([3, 4, 3])
    with col1:
        st.markdown("<h2 class='main-header'>FNA.TERMINAL</h2>", unsafe_allow_html=True)
        st.caption("FINANCIAL NEWS ANALYST • DESK EDITION")
    
    with col2:
        st.markdown(f"""
        <div style='text-align:center; font-family: monospace; font-size:13px;'>
            MARKET • LIVE  UTC {datetime.utcnow().strftime('%d %b %Y %H:%M:%S')}
        </div>
        """, unsafe_allow_html=True)
    
    with col3:
        st.markdown(f"""
        <div style='text-align:right;'>
            👤 analyst@desk.fna  <a href="#" onclick="window.location.reload()">LOGOUT</a>
        </div>
        """, unsafe_allow_html=True)
    
    # Market ticker bar
    ticker_html = " | ".join([f"<span>{k} {v}</span>" for k, v in market_data.items()])
    st.markdown(f"""
    <div class='market-ticker' style='margin-bottom: 20px;'>
        {ticker_html}
    </div>
    """, unsafe_allow_html=True)
    
    # Main layout
    col_left, col_main, col_right = st.columns([1.2, 3, 1.2])
    
    with col_left:
        st.subheader("SESSION HISTORY")
        st.info("No queries yet.")
        st.caption("QUERIES STORED LOCAL • NOT SYNCED")
    
    with col_main:
        st.markdown("### AI ANALYSIS - STRUCTURED REPORT")
        
        company_input = st.text_input(
            "ENTER TICKER OR COMPANY NAME",
            placeholder="E.g., AAPL, TESLA, NVDA",
            key="company_input"
        )
        
        if st.button("ANALYZE", type="primary", use_container_width=True, key="analyze_btn"):
            if company_input.strip():
                with st.spinner(f"Pulling real-time data for {company_input.upper()}..."):
                    # Mock backend call (replace with your actual API)
                    try:
                        # Example backend call - replace URL with your real endpoint
                        response = requests.post(
                            "http://your-backend-api.com/analyze",  # ← CHANGE THIS
                            json={"company": company_input, "token": st.session_state.jwt_token},
                            timeout=15
                        )
                        
                        if response.status_code == 200:
                            result = response.json().get("analysis", "Analysis completed.")
                            st.session_state.analysis_result = result
                        else:
                            st.session_state.analysis_result = f"Backend error: {response.status_code}"
                    except Exception as e:
                        # Mock response for demo
                        st.session_state.analysis_result = f"""
FNA ENGINE IDLE - {company_input.upper()} ANALYSIS
────────────────────────────────────────────
SUMMARY: Strong momentum in {company_input.upper()}. Positive sentiment driven by recent earnings and AI adoption.

SENTIMENT: Bullish (82%)
RISKS: Valuation concerns, macroeconomic headwinds.
RECOMMENDATION: BUY with target price +18% in 12 months.

Full structured report would appear here from your backend.
                        """
                
                st.success("Analysis complete")
                st.rerun()
            else:
                st.warning("Please enter a company name or ticker")
        
        # Result display
        st.markdown("#### ANALYSIS OUTPUT")
        st.markdown(f"""
        <div class='result-box' style='min-height: 420px; white-space: pre-wrap;'>
{st.session_state.analysis_result or 'Enter a company name or ticker above and click ANALYZE.\n\nThe terminal will pull real-time quote data, latest headlines and generate a structured analyst report covering Summary, Sentiment, Risks and Recommendation.'}
        </div>
        """, unsafe_allow_html=True)
    
    with col_right:
        st.subheader("LIVE QUOTE")
        st.info("AWAITING TICKER")
        
        st.subheader("TOP HEADLINES")
        st.info("NO NEWS YET")

# Main app flow
if not st.session_state.logged_in:
    login_page()
else:
    main_terminal()

# Footer
st.markdown("---")
st.markdown("<p style='text-align: center; color: #666;'>© FNA Terminal • Demo Frontend</p>", unsafe_allow_html=True)