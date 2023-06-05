const navbar = ( 

<nav className="navbar navbar-inverse" style={{ backgroundColor: 'black', color: '#fff', fontFamily: 'Tilt Warp' }}>

      <div className="container-fluid">

        <ul className="nav navbar-nav">
          <li className="active"><a href="#">Home</a></li>
          <li><a href="#">About</a></li>
          <li><a href="#">Contact</a></li>
        </ul>
        <ul className="nav navbar-nav navbar-right">
          <li>
            <button
              type="button"
              className="btn btn-link"
              style={{ marginTop: '7px', textDecoration: 'None' }}
            //   onClick={handleSignupClick}
            >
              <span className="glyphicon glyphicon-user"></span> Sign Up
            </button>
          </li>
          <li>
            <button
              type="button"
              className="btn btn-link"
              style={{ marginTop: '7px', textDecoration: 'None' }}
            //   onClick={handleLoginClick}
            >
              <span className="glyphicon glyphicon-log-in"></span> Login
            </button>
          </li>
        </ul>
      </div>
    </nav>
)
  

  ReactDOM.render(navbar, document.getElementById("root"));
