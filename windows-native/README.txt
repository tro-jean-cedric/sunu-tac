SUNU TAC - native install on Windows Server (no Docker)
=======================================================

What runs on the server
  - PostgreSQL 16 (Windows service, installed once by hand)
  - SUNU TAC (Windows service "SunuTAC"): embedded Python serving the API, the employee test (/)
    and the HR console (/admin/) on one port (8080 by default)
  - a scheduled task "SUNU TAC backup" (every night at 02:00, 30 days kept in C:\sunu-tac\backups)

Nothing is downloaded during the install: Python and all its packages are inside this zip.


1. FIRST TIME ONLY - install PostgreSQL 16
------------------------------------------
  - Download "PostgreSQL 16 - Windows x86-64" (EDB installer):
      https://www.enterprisedb.com/downloads/postgres-postgresql-downloads
  - Run it with the defaults (port 5432). Untick "Stack Builder" at the end.
  - Write down the password you choose for the "postgres" user: install.cmd asks for it once.


2. INSTALL (and every update)
-----------------------------
  - Copy sunu-tac-windows-<version>.zip to the server and extract it anywhere (e.g. Downloads).
  - Right-click install.cmd > Run as administrator.

  First install: asks for the "postgres" password, creates the database, C:\sunu-tac\.env (random secrets),
  the Windows service, the firewall rule (port 8080) and the nightly backup task, then prints the
  HR console login (admin.drh / generated password - also in C:\sunu-tac\.env).

  Update: same thing with a newer zip. It backs up the database first, replaces the program files,
  keeps .env, backups and data, applies database changes and restarts the service.


3. AFTER THE FIRST INSTALL
--------------------------
  - Edit C:\sunu-tac\.env: LDAP_BIND_DN and LDAP_BIND_PASSWORD (service account), optional API keys.
  - Restart: PowerShell as administrator >  Restart-Service SunuTAC
  - Open http://<server>:8080/admin/ , log in as admin.drh,
    then Administration > Synchroniser l'annuaire.
  - Employees: http://<server>:8080/

  To bring existing data over: on the Mac  ./tac.sh backup , copy the .dump file, then on the server
  (as administrator):  C:\sunu-tac\restore.cmd C:\path\to\file.dump


DAY TO DAY
----------
  Status / restart   Services (services.msc) > "SUNU TAC", or  Restart-Service SunuTAC
  Logs               C:\sunu-tac\logs\SunuTAC.out.log and SunuTAC.err.log
  Backup now         C:\sunu-tac\backup.cmd   (copy C:\sunu-tac\backups off the server regularly)
  Restore            C:\sunu-tac\restore.cmd C:\sunu-tac\backups\tac-XXXX.dump   (as administrator)
  Version            C:\sunu-tac\VERSION.txt
  Change the port    HTTP_PORT in .env, then run install.cmd again from the extracted zip (service + firewall)


TROUBLESHOOTING
---------------
  "Python packages failed to load"  install the Microsoft Visual C++ Redistributable 2015-2022 (x64).
  "cannot connect to PostgreSQL"    wrong "postgres" password, or the postgresql-x64-16 service is stopped.
  The service stops right away      read C:\sunu-tac\logs\SunuTAC.err.log (often a wrong value in .env).
