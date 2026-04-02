const Signup = () => {
    return (
        <>
        <div className="signup-page">
            <div className="signupform">
            <form className="signup-form">
                <h1>Create An Account</h1>
                <input type="text" placeholder="Name"/>
                <input type="password" placeholder="Email"/>
                <input type="text" placeholder="Password"/>
                <button>create</button>
                <p className="message">Already registered? <a href="login.tsx">Sign In</a></p>
            </form>
            </div>
        </div>
        </>
    );
}

export default Signup;