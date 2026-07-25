import { db } from "../connect.js";
import bcrypt from "bcryptjs";
import { createTokens } from "../jwt.js";
import nodemailer from "nodemailer";
import crypto from "crypto";

const isProduction = process.env.NODE_ENV === "production";

export const register = (req,res)=>{
    // CHECK IF USER EXITS

    const q = "SELECT * FROM users WHERE email = ?" // ? provides extra security instead of req.body etc.
    
    db.query(q,[req.body.email], (err,data)=>{
        if(err) return res.status(500).json(err)
        if(data.length) return res.status(409).json("User already exists!")
        // CREATE A NEW USER   
        // hash the password
        const salt = bcrypt.genSaltSync(10);
        const hashedPassword = bcrypt.hashSync(req.body.password, salt);

        const serviceCategoryId = req.body.account_type === "student" && req.body.serviceCategoryId != null && req.body.serviceCategoryId !== ""
            ? Number(req.body.serviceCategoryId)
            : null;

        if (serviceCategoryId !== null && (!Number.isInteger(serviceCategoryId) || serviceCategoryId <= 0)) {
            return res.status(400).json("Invalid service category.");
        }

        const createUser = () => {
            const q = serviceCategoryId === null
                ? "INSERT INTO users (`username`,`email`,`password`,`account_type`) VALUE (?)"
                : "INSERT INTO users (`username`,`email`,`password`,`account_type`,`serviceCategoryId`) VALUE (?)";
            const values = [
                req.body.username,
                req.body.email,
                hashedPassword,
                req.body.account_type,
            ];
            if (serviceCategoryId !== null) values.push(serviceCategoryId);

            db.query(q,[values],(err, data)=>{
            if(err) return res.status(500).json(err);
            const token = createTokens({ id: data.insertId, username: req.body.username, account_type: req.body.account_type });
            res.cookie("accessToken", token, {
                maxAge: 15*24*60*60*1000,
                httpOnly: true,
                sameSite: isProduction ? "none" : "lax",
                secure: isProduction
            }).status(200).json({ id: data.insertId, token });
            console.log("logged in");
            });
        };

        if (serviceCategoryId === null) return createUser();

        db.query("SELECT id FROM categories WHERE id = ?", [serviceCategoryId], (err, categories) => {
            if (err) return res.status(500).json(err);
            if (categories.length === 0) return res.status(400).json("Invalid service category.");
            createUser();
        });
    });
};

export const login = (req,res)=>{
    // CHECK IF USER EXISTS
    const q = "SELECT * FROM users WHERE email = ?";

    db.query(q,[req.body.email], (err,data)=>{
        if (err) return res.status(500).json(err);
        if (data.length === 0) return res.status(404).json("User not found!");

        const checkPassword = bcrypt.compareSync(
            req.body.password, 
            data[0].password
        );

        if(!checkPassword) return res.status(400).json("Wrong password or email!");

        const {password, ...others} = data[0];
        const token = createTokens(data[0]);

        res.cookie("accessToken", token, {
            maxAge: 60*60*24*30*1000,
            httpOnly: true,
            sameSite: isProduction ? "none" : "lax",
            secure: isProduction
        }).status(200).json({ ...others, token });
        console.log("logged in");
    });
    
};

export const logout = (req,res)=>{
    console.log("logged out")
    res.clearCookie("accessToken", {
        secure: isProduction,
        sameSite: isProduction ? "none" : "lax",
        httpOnly: true,
    }).status(200).json("User has been logged out.")
}


function sendEmail({ recipient_email, OTP }) {
    return new Promise((resolve, reject) => {
      var transporter = nodemailer.createTransport({
        host: "smtp.gmail.com",
        port: 587,
        secure: false,
        auth: {
          user: process.env.MY_EMAIL,
          pass: process.env.APP_PASSWORD,
        },
      });
  
      const mail_configs = {
        from: {name: "PostStation Admin", address: process.env.MY_EMAIL},
        to: recipient_email,
        subject: "PostStation Secure Password Reset",
        html: `<!DOCTYPE html>
                  <html lang="en" >
                    <head>
                      <meta charset="UTF-8">
                      <title>PostStation - OTP Email Template</title>
                    
                    </head>
                    <body>
                      <!-- partial:index.partial.html -->
                      <div style="font-family: Helvetica,Arial,sans-serif;min-width:1000px;overflow:auto;line-height:2">
                        <div style="margin:50px auto;width:70%;padding:20px 0">
                          <div style="border-bottom:1px solid #eee">
                            <a href="" style="font-size:1.4em;color: #6D1D1D;text-decoration:none;font-weight:600">Poststation</a>
                          </div>
                          <p style="font-size:1.1em">Hi,</p>
                          <p>Thank you for choosing Poststation. Enter the following token to complete your password reset. Token is valid for 5 minutes</p>
                          <h2 style="background: #6D1D1D;margin: 0 auto;width: max-content;padding: 0 10px;color: #fff;border-radius: 4px;">${OTP}</h2>
                          <p style="font-size:0.9em;">Regards,<br />PostStation Admin</p>
                          <hr style="border:none;border-top:1px solid #eee" />
                          <div style="float:right;padding:8px 0;color:#aaa;font-size:0.8em;line-height:1;font-weight:300">
                            <p>La Voz Hispana</p>
                            <p>307 S Main St #107</p>
                            <p> Bryan, TX 77803</p>
                          </div>
                        </div>
                      </div>
                      <!-- partial -->
                    </body>
                  </html>`,
      };

      try {
        transporter.sendMail(mail_configs, function (error, info) {
          if (error) {
            console.log(error);
            return reject({ message: `An error has occured` });
          }
          return resolve({ message: "Email sent succesfuly" });
        });
      } catch (error) {
        console.error(error)
      }
    });
}

export const sendRecoveryEmail = (req, res) => {
  sendEmail(req.body)
    .then((response) => {
      res.status(200).send(response.message); // Send response inside the .then() block
      console.log("fake email sent!");
    })
    .catch((error) => res.status(500).send(error.message));
}

export const resetPassword = (req, res) => {
  const q = "SELECT * FROM users WHERE email = ?";
  db.query(q,[req.body.email], (err,data)=>{
    if (err) return res.status(500).json(err);
    if (data.length === 0) return res.status(404).json("User not found!");
    else {
      const salt = bcrypt.genSaltSync(10);
      const hashedPassword = bcrypt.hashSync(req.body.password, salt);
      const q = "UPDATE users SET password = ? WHERE email = ?"
      db.query(q,[hashedPassword, req.body.email],(err)=>{
        if(err) return res.status(500).json(err)
        return res.status(200).json("Password has been updated.")
      });
    }
  });
}
